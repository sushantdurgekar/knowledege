// The admin API (build-contracts.md §19). Only the lazy /admin chunk imports this module.
// Every route answers 404 `not_found` to anyone who is not an admin; the destructive ones
// (a backup, entering `full` maintenance, cancelling a job) also need a sign-in within 24 h
// (403 `reauth_required`) and a typed confirmation (422 `confirm_required`).
import { api, ApiProblem } from './api';

export const CONFIRM = { backup: 'BACKUP', full: 'FULL', cancel: 'CANCEL' } as const;
export const MIN_PASSPHRASE = 12;
export const MAX_MESSAGE = 500;
export const MAX_NOTICE = 1000;

export type Mode = 'off' | 'read_only' | 'full';
export const MODES: readonly Mode[] = ['off', 'read_only', 'full'];
export const MODE_LABEL: Record<string, string> = { off: 'Off', read_only: 'Read-only', full: 'Full' };

export interface UsedLimit {
  used: number;
  limit: number;
}

export interface BackupLogEntry {
  at: string;
  bytes: number;
  fileSha256: string;
  counts: Record<string, number>;
  encrypted: boolean;
  consistent: boolean;
}

/** A maintenance window, or a restore job (kind "restore": `runAt`, `fileName`, no window). */
export interface Job {
  id: string;
  kind: string;
  state: string;
  mode: string;
  startAt?: string;
  runAt?: string;
  fileName?: string;
  error?: string | null;
  endAt?: string;
  tz: string;
  durationMin?: number;
  message: string | null;
  createdAt?: string;
  createdBy?: string | null;
  finishedAt?: string;
}

export interface Upcoming {
  mode: string;
  startAt: string;
  message: string | null;
}

export interface Stats {
  store: string;
  users: number;
  quotaDay: { day: string; resetsAt: string; resetsAtLocal: string; tz: string };
  firestore: {
    writes: UsedLimit & { budget: number; tier: number | 'paused' };
    reads: UsedLimit;
    deletes: UsedLimit;
    storage: { estBytes: number | null; docs: number | null; limit: number; asOf: string | null };
    egressMonth: { bytes: number; limit: number };
  };
  host: { egressMonth: { bytes: number; limit: number }; rssBytes: number | null; ramLimit: number };
  breakers?: Record<string, string | null>;
  maintenance: { mode: string; message: string | null; until: string | null; forced?: boolean };
  upcoming: Upcoming | null;
  jobs: Job[];
  missedJobs?: Job[];
  /** Restore jobs in `needs_attention` (the site stays in full maintenance). */
  attentionJobs?: Job[];
  lastBackup: BackupLogEntry | null;
  tier: number | string;
  adminTz?: string;
}

export interface MaintenanceState {
  mode: string;
  message: string | null;
  until: string | null;
  version: number;
  /** MAINTENANCE_FORCE is set on the server: it overrides the stored mode. */
  forced: boolean;
  stored: { mode: string; message: string | null; until: string | null };
  upcoming: Upcoming | null;
}

export interface SiteSettings {
  tz: string;
  notice: string | null;
  version: number;
}

export interface Estimate {
  users: number;
  docs: number;
  tombstones: number;
  estReads: number;
  readsLeftToday: number;
  fits: boolean;
}

export interface Ticket {
  ticket: string;
  filename: string;
  expiresIn: number;
}

export const getStats = (signal?: AbortSignal) => api<Stats>('/api/admin/stats', { signal });
export const recount = () => api<{ storage: Stats['firestore']['storage'] }>('/api/admin/stats/recount', { method: 'POST' });

export const getMaintenance = (signal?: AbortSignal) => api<MaintenanceState>('/api/admin/maintenance', { signal });
export const putMaintenance = (body: { mode: Mode; message: string | null; version?: number; confirm?: string }) =>
  api<MaintenanceState>('/api/admin/maintenance', { method: 'PUT', json: body });

export const getSettings = (signal?: AbortSignal) => api<SiteSettings>('/api/admin/settings', { signal });
export const putSettings = (body: { tz: string; notice: string | null; version?: number }) =>
  api<SiteSettings>('/api/admin/settings', { method: 'PUT', json: body });

export async function listJobs(signal?: AbortSignal): Promise<Job[]> {
  const body = await api<{ jobs?: Job[] }>('/api/admin/jobs', { signal });
  return Array.isArray(body?.jobs) ? body.jobs : [];
}

export interface NewJob {
  mode: 'read_only' | 'full';
  /** An ISO date-time, a wall-clock "YYYY-MM-DDTHH:mm" in `tz`, or "tonight" (00:00 in `tz`). */
  startAt: string;
  tz: string;
  durationMin: number;
  message: string | null;
  confirm?: string;
}

export async function createJob(job: NewJob): Promise<Job> {
  const body = await api<{ job: Job }>('/api/admin/jobs', { method: 'POST', json: { kind: 'maintenance', ...job } });
  return body.job;
}

export async function cancelJob(id: string, confirm: string): Promise<Job> {
  const body = await api<{ job: Job }>(`/api/admin/jobs/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    json: { confirm },
  });
  return body.job;
}

export const backupEstimate = (signal?: AbortSignal) => api<Estimate>('/api/admin/backups/estimate', { signal });

export async function backupLog(signal?: AbortSignal): Promise<BackupLogEntry[]> {
  const body = await api<BackupLogEntry[]>('/api/admin/backups/log', { signal });
  return Array.isArray(body) ? body : [];
}

export const createBackup = (body: { passphrase: string | null; requireReadOnly: boolean; confirm: string }) =>
  api<Ticket>('/api/admin/backups', { method: 'POST', json: body });

/** The single-use download URL of a backup ticket (GET with the admin cookie). */
export const backupUrl = (ticket: string): string => `/api/admin/backups/${encodeURIComponent(ticket)}`;

/**
 * Start the browser's own download of a ticket: the file streams to disk (it can be large), so
 * it never passes through page memory the way a fetch + Blob would.
 */
export function startDownload(url: string, fileName: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

// --- helpers ----------------------------------------------------------------------------------

/** "Read-only", "Full", or "Restore (merge)" for a restore job. */
export const jobLabel = (job: Job): string =>
  job.kind === 'restore' ? `Restore (${job.mode})` : (MODE_LABEL[job.mode] ?? job.mode);

/** When a job starts: a window's `startAt`, a restore's `runAt`. */
export const jobStart = (job: Job): string | undefined => job.startAt ?? job.runAt;

/** A window can be cancelled while scheduled or running; a restore only before it starts. */
export const cancellable = (job: Job): boolean =>
  job.state === 'scheduled' || (job.state === 'running' && job.kind !== 'restore');

/** Meter tone (build-contracts §21): good below 50%, trap below 80%, bad from there on. */
export function meterTone(used: number, limit: number): 'good' | 'trap' | 'bad' {
  const ratio = limit > 0 ? used / limit : 1;
  if (ratio < 0.5) return 'good';
  if (ratio < 0.8) return 'trap';
  return 'bad';
}

/** "13 Oct, 00:00 IST": a moment in a time zone, or the raw value when it is not a date. */
export function formatIn(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'short',
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

/** True for a time zone this browser knows (the server checks against the IANA database too). */
export function isTimeZone(name: string): boolean {
  if (!name) return false;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

/** Zones for the settings field's suggestions (every IANA zone when the browser can list them). */
export function timeZones(): string[] {
  const list = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone');
  return list && list.length > 0 ? list : ['Asia/Kolkata', 'UTC', 'America/Los_Angeles', 'Europe/London'];
}

/** A random passphrase of 24 characters from a 32-letter alphabet (120 bits), in groups of 4. */
export function generatePassphrase(
  random: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array = (b) => crypto.getRandomValues(b),
): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'; // 32 letters: no l, o, 0 or 1
  const bytes = random(new Uint8Array(24));
  const chars = Array.from(bytes, (byte) => alphabet[byte & 31]);
  return [0, 4, 8, 12, 16, 20].map((i) => chars.slice(i, i + 4).join('')).join('-');
}

/** The admin-facing text of a failure (`reauth_required` is handled before this). */
export function adminProblem(error: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (!(error instanceof ApiProblem)) return fallback;
  if (error.status === 0) return 'Couldn’t reach the server. Check your connection and try again.';
  if (error.code === 'conflict') return 'Someone else changed this meanwhile. The latest values are loaded; check and try again.';
  return error.message && error.message !== error.code ? error.message : fallback;
}
