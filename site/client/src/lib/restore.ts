// The restore API (build-contracts.md §24-25). Only the lazy /admin chunk imports this module.
//
// A backup is uploaded in 4 MiB chunks, each with its SHA-256 (crypto.subtle) in
// `X-Chunk-SHA256`; the server keeps the received chunks, so an upload resumes after a reload
// when the admin picks the same file again (same name, size and lastModified). The wizard keeps
// the upload id, the header it read and the last restore job in `studyhubs.ui.restore`
// (no passphrase, no file content).
import { api, ApiProblem } from './api';

export const HEADER_PREVIEW_BYTES = 64 * 1024;
export const STORAGE_KEY = 'studyhubs.ui.restore';
export const CONFIRM_RESTORE = 'RESTORE';
/** Polling of a validation and of a restore job; the tests shorten these. */
export const POLL = { validateMs: 1000, jobMs: 2000, retryMs: 1000 };
/** A chunk is sent this many times at most (network errors, 5xx, a checksum mismatch). */
export const CHUNK_ATTEMPTS = 4;
const CHUNK_TIMEOUT_MS = 120_000;

const MAGIC = [0x53, 0x48, 0x42, 0x4b]; // "SHBK"
const FLAG_ENCRYPTED = 1;

export type UploadState = 'uploading' | 'assembled' | 'validating' | 'validated' | 'invalid';
export type RestoreMode = 'merge' | 'replace';
export type RunAt = 'now' | 'tonight' | 'after_quota_reset';
export const ACTIVE_JOB_STATES = ['scheduled', 'running', 'paused_quota'];

/** What the wizard shows of a backup's header (no encryption parameters). */
export interface BackupHeader {
  createdAt: string | null;
  source: { store?: string | null; project?: string | null; origin?: string | null };
  app?: { version?: string | null; commit?: string | null } | null;
  consistent: boolean;
  encrypted: boolean;
  estimated: Record<string, number>;
}

export interface Plan {
  compared: boolean;
  users?: { new: number; existing: number };
  progress?: { newer: number; older: number; identical: number };
  skipped: {
    tombstonedInBackup: { user: number; progress: number };
    tombstonedInTarget: { user: number; progress: number };
  };
  estWrites?: number;
  daysNeeded?: number;
  fitsToday?: boolean;
}

export interface ValidationReport {
  header: BackupHeader;
  counts: Record<string, number>;
  records: number;
  linesSha256: string;
  fileSha256: string;
  bytes: number;
  target: { store: string; users: number; progress: number };
  plan: Plan;
  modes: RestoreMode[];
}

export interface Upload {
  uploadId: string;
  name: string;
  size: number;
  lastModified: number;
  chunkSize: number;
  chunks: number;
  createdAt?: string;
  state: UploadState;
  received: number[];
  header?: BackupHeader;
  report?: ValidationReport;
  error?: string;
}

export interface VerifyReport {
  mode: RestoreMode;
  endCounts: Record<string, number>;
  written: Record<string, number>;
  kept: Record<string, number>;
  skipped: Record<string, number>;
  countsOk: boolean;
  sample: { checked: number; mismatched: number };
  ok: boolean;
}

export interface RestoreJob {
  id: string;
  kind: 'restore';
  state: string;
  uploadId: string;
  fileName?: string;
  mode: RestoreMode;
  runAt: string;
  resumeAt?: string;
  /** A fresh start waits until then in full maintenance before its first write. */
  drainUntil?: string;
  tz: string;
  exitMaintenanceOnSuccess?: boolean;
  total?: number;
  progress?: { done: number; total: number };
  report?: VerifyReport;
  error?: string | null;
  createdAt?: string;
  finishedAt?: string;
}

/** What `studyhubs.ui.restore` holds. */
export interface Saved {
  key?: string;
  uploadId?: string;
  header?: BackupHeader;
  jobId?: string;
}

// --- the header -----------------------------------------------------------------------------

export class HeaderError extends Error {
  override name = 'HeaderError';
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The header of a `.backup` v1 file from its first bytes (build-contracts §20). */
export function parseHeader(bytes: Uint8Array): BackupHeader {
  if (bytes.length < 10 || MAGIC.some((byte, i) => bytes[i] !== byte)) {
    throw new HeaderError('This is not a Study Hubs backup (.backup) file.');
  }
  if (bytes[4] !== 1) throw new HeaderError(`Unsupported backup version ${bytes[4]}.`);
  const flags = bytes[5] ?? 0;
  if (flags & ~FLAG_ENCRYPTED) throw new HeaderError('The file has unknown flags; it may be damaged.');
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(6);
  if (length < 2) throw new HeaderError('The backup header is damaged.');
  if (10 + length > bytes.length) {
    throw new HeaderError(
      bytes.length >= HEADER_PREVIEW_BYTES ? 'The backup header is too large to be genuine.' : 'The file is truncated.',
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(10, 10 + length)));
  } catch {
    throw new HeaderError('The backup header is damaged.');
  }
  if (!isObject(raw) || raw.format !== 'studyhubs-backup' || raw.v !== 1) {
    throw new HeaderError('This is not a Study Hubs backup (.backup) file.');
  }
  const encrypted = Boolean(flags & FLAG_ENCRYPTED);
  if (encrypted !== isObject(raw.encryption)) throw new HeaderError('The backup header is damaged.');
  const source = isObject(raw.source) ? raw.source : {};
  const estimated = isObject(raw.estimated) ? raw.estimated : {};
  const text = (value: unknown) => (typeof value === 'string' ? value : null);
  return {
    createdAt: text(raw.createdAt),
    source: { store: text(source.store), project: text(source.project), origin: text(source.origin) },
    app: isObject(raw.app) ? { version: text(raw.app.version), commit: text(raw.app.commit) } : null,
    consistent: raw.consistent === true,
    encrypted,
    estimated: Object.fromEntries(
      Object.entries(estimated).filter((entry): entry is [string, number] => Number.isInteger(entry[1])),
    ),
  };
}

/** Read the first 64 KiB of the file and parse its header. */
export async function readHeader(file: Blob): Promise<BackupHeader> {
  const head = await file.slice(0, HEADER_PREVIEW_BYTES).arrayBuffer();
  return parseHeader(new Uint8Array(head));
}

// --- the wizard's memory ---------------------------------------------------------------------

/** Name + size + lastModified: the same file picked again after a reload. */
export const fileKey = (file: { name: string; size: number; lastModified: number }): string =>
  `${file.size}:${file.lastModified}:${file.name}`;

export function loadSaved(): Saved {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return isObject(raw) ? (raw as Saved) : {};
  } catch {
    return {};
  }
}

export function saveSaved(saved: Saved): void {
  try {
    if (Object.keys(saved).length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // storage full or blocked: resuming after a reload just needs the file picked again
  }
}

// --- API ---------------------------------------------------------------------------------------

const BASE = '/api/admin/restore/uploads';
const uploadPath = (id: string) => `${BASE}/${encodeURIComponent(id)}`;

export const createUpload = (file: { name: string; size: number; lastModified: number }) =>
  api<Upload>(BASE, { method: 'POST', json: { name: file.name, size: file.size, lastModified: file.lastModified } });

export async function listUploads(signal?: AbortSignal): Promise<Upload[]> {
  const body = await api<{ uploads?: Upload[] }>(BASE, { signal });
  return Array.isArray(body?.uploads) ? body.uploads : [];
}

export const getUpload = (id: string, signal?: AbortSignal) => api<Upload>(uploadPath(id), { signal });

export const validateUpload = (id: string, passphrase: string | null) =>
  api<Upload>(`${uploadPath(id)}/validate`, { method: 'POST', json: passphrase ? { passphrase } : {} });

export const deleteUpload = (id: string) => api<null>(uploadPath(id), { method: 'DELETE' });

export interface NewRestore {
  uploadId: string;
  mode: RestoreMode;
  runAt: RunAt;
  tz: string;
  exitMaintenanceOnSuccess: boolean;
  confirm: string;
}

export async function createRestoreJob(body: NewRestore): Promise<RestoreJob> {
  const out = await api<{ job: RestoreJob }>('/api/admin/jobs', { method: 'POST', json: { kind: 'restore', ...body } });
  return out.job;
}

export async function getRestoreJob(id: string, signal?: AbortSignal): Promise<RestoreJob> {
  const out = await api<{ job: RestoreJob }>(`/api/admin/jobs/${encodeURIComponent(id)}`, { signal });
  return out.job;
}

/** The phrase the confirmation field must hold: "RESTORE", or "REPLACE <target users> USERS". */
export const confirmPhrase = (mode: RestoreMode, targetUsers: number): string =>
  mode === 'merge' ? CONFIRM_RESTORE : `REPLACE ${targetUsers} USERS`;

// --- upload ------------------------------------------------------------------------------------

/** Lowercase hex SHA-256 of `data` (Web Crypto; needs a secure context: https or localhost). */
export async function sha256Hex(data: BufferSource): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Bytes of `upload` already on the server. */
export function receivedBytes(upload: Pick<Upload, 'received' | 'chunkSize' | 'size'>): number {
  return upload.received.reduce((sum, n) => sum + Math.max(0, Math.min(upload.chunkSize, upload.size - n * upload.chunkSize)), 0);
}

export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(done, ms);
    function done() {
      signal?.removeEventListener('abort', abort);
      resolve();
    }
    function abort() {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    }
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });

const retryable = (error: unknown) =>
  error instanceof ApiProblem && (error.status === 0 || error.status >= 500 || error.code === 'checksum');

/**
 * Send every chunk the server doesn't have yet, one at a time, in order. Each chunk is read from
 * the file again for every attempt, so a checksum mismatch in transit is simply retried.
 * Returns the upload as the last chunk left it (`assembled` once complete).
 */
export async function uploadMissing(
  file: Blob,
  upload: Upload,
  opts: { signal?: AbortSignal; onProgress?: (upload: Upload) => void } = {},
): Promise<Upload> {
  let current = upload;
  const missing = Array.from({ length: upload.chunks }, (_, n) => n).filter((n) => !upload.received.includes(n));
  for (const n of missing) {
    const start = n * upload.chunkSize;
    const blob = file.slice(start, Math.min(upload.size, start + upload.chunkSize));
    for (let attempt = 1; ; attempt++) {
      opts.signal?.throwIfAborted();
      try {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const sha = await sha256Hex(bytes);
        const out = await api<{ state: UploadState; received: number[] }>(`${uploadPath(upload.uploadId)}/chunks/${n}`, {
          method: 'PUT',
          body: bytes,
          headers: { 'Content-Type': 'application/octet-stream', 'X-Chunk-SHA256': sha },
          signal: opts.signal,
          timeoutMs: CHUNK_TIMEOUT_MS,
        });
        current = { ...current, state: out.state, received: out.received };
        opts.onProgress?.(current);
        break;
      } catch (error) {
        if (opts.signal?.aborted || attempt >= CHUNK_ATTEMPTS || !retryable(error)) throw error;
        await sleep(POLL.retryMs * 2 ** (attempt - 1), opts.signal);
      }
    }
  }
  return current;
}
