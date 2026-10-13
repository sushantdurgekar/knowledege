// The signed-in user's own data (build-contracts.md §18, §21): the server's per-hub listing,
// the export download, account deletion, and this browser's storage use per hub.
import {
  allKeys,
  legacySidecarKey,
  localHubParts,
  mockRunKey,
  progressKey,
  syncedKey,
  type StorageLike,
} from '@bridge-shared';
import { api, apiResponse, ApiProblem } from './api';
import { saveBlob, type SyncHub } from './hubs';

export const PARTS = ['main', 'mocks', 'cards', 'legacy'] as const;

export interface ServerPart {
  upd: number;
  bytes: number;
}

export interface ServerHub {
  hub: string;
  /** Null when the hub is no longer in the catalog. */
  slug: string | null;
  title: string | null;
  parts: Partial<Record<(typeof PARTS)[number], ServerPart>>;
  done: number;
}

export interface MyProgress {
  hubs: ServerHub[];
  /** When the account was created (ISO), or null when unknown. */
  joined: string | null;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0);
const str = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

export function parseMyProgress(raw: unknown): MyProgress {
  const hubs: ServerHub[] = [];
  const list = isObject(raw) && Array.isArray(raw.hubs) ? raw.hubs : [];
  for (const item of list) {
    if (!isObject(item) || !str(item.hub)) continue;
    const parts: ServerHub['parts'] = {};
    if (isObject(item.parts)) {
      for (const part of PARTS) {
        const value = item.parts[part];
        if (isObject(value)) parts[part] = { upd: num(value.upd), bytes: num(value.bytes) };
      }
    }
    hubs.push({ hub: item.hub as string, slug: str(item.slug), title: str(item.title), parts, done: num(item.done) });
  }
  return { hubs, joined: isObject(raw) ? str(raw.joined) : null };
}

/** GET /api/me/progress (1 read per stored hub document, plus the user document). */
export async function fetchMyProgress(signal?: AbortSignal): Promise<MyProgress> {
  return parseMyProgress(await api('/api/me/progress', { signal }));
}

/** The file name in a `Content-Disposition: attachment; filename="…"` header. */
export function attachmentName(header: string | null, fallback: string): string {
  const match = header ? /filename="([^"]+)"/.exec(header) : null;
  const name = match?.[1];
  return name && /^[\w.-]+$/.test(name) ? name : fallback;
}

/** GET /api/me/export, saved as `studyhubs-export-<YYYYMMDD>.json` (5 per hour). */
export async function downloadExport(): Promise<string> {
  const response = await apiResponse('/api/me/export');
  const name = attachmentName(response.headers.get('Content-Disposition'), 'studyhubs-export.json');
  saveBlob(name, await response.blob());
  return name;
}

/** The phrase the delete dialog asks for; the server checks the same words. */
export const DELETE_PHRASE = 'DELETE';

/** DELETE /api/me (needs a sign-in within 24 h: 403 `reauth_required` otherwise). */
export async function deleteAccount(confirm: string): Promise<void> {
  await api('/api/me', { method: 'DELETE', json: { confirm } });
}

export const isReauth = (error: unknown): boolean => error instanceof ApiProblem && error.code === 'reauth_required';

// --- this browser's storage --------------------------------------------------------------------

/** Every key that holds one hub's progress in this browser (hub records, synced stamps, sidecars). */
export function hubStorageKeys(hub: SyncHub): string[] {
  if (hub.engine === 'legacy') {
    const key = hub.legacyKeys[0];
    return key ? [key, legacySidecarKey(key), syncedKey(hub.id)] : [syncedKey(hub.id)];
  }
  return [progressKey(hub.id), mockRunKey(hub.id), syncedKey(hub.id)];
}

/** Bytes the browser charges for `keys` (UTF-16: two bytes per code unit of key and value). */
export function storageBytes(storage: StorageLike, keys: readonly string[]): number {
  const present = new Set(allKeys(storage));
  let total = 0;
  for (const key of keys) {
    if (!present.has(key)) continue;
    let value: string | null = null;
    try {
      value = storage.getItem(key);
    } catch {
      /* unreadable: count nothing */
    }
    if (value !== null) total += (key.length + value.length) * 2;
  }
  return total;
}

/** Bytes used by every key of this origin's storage. */
export function totalStorageBytes(storage: StorageLike): number {
  return storageBytes(storage, allKeys(storage));
}

export interface LocalHubUsage {
  hub: SyncHub;
  bytes: number;
  unsynced: number;
}

/** Storage use of each catalog hub that has something in this browser. */
export function localUsage(storage: StorageLike, hubs: readonly SyncHub[]): LocalHubUsage[] {
  const out: LocalHubUsage[] = [];
  for (const hub of hubs) {
    const bytes = storageBytes(storage, hubStorageKeys(hub));
    if (bytes > 0) out.push({ hub, bytes, unsynced: Object.keys(localHubParts(storage, hub)).length });
  }
  return out;
}

/**
 * Remove one hub's local copy. Callers allow it only for a fully synced hub (nothing unsynced,
 * this account owns the browser's progress, and the server lists the hub), so the next visit
 * to the hub restores it from the account. Returns the keys removed.
 */
export function removeLocalCopy(storage: StorageLike, hub: SyncHub): string[] {
  const removed: string[] = [];
  for (const key of hubStorageKeys(hub)) {
    try {
      if (storage.getItem(key) === null) continue;
      storage.removeItem(key);
      removed.push(key);
    } catch {
      /* ignore */
    }
  }
  return removed;
}

/** "1.2 KB", "3.4 MB": binary units, one decimal. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}
