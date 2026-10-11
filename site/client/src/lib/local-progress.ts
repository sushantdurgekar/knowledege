// Read-only summary of the progress a hub keeps in this browser's localStorage.
//
// Mirrors the bridge's local-progress summary (build-contracts.md §6-7, hub-runtime-contract.md §3):
//   v2 hubs     localStorage[storageKeys[0]] = {S, MOCKS, CARDS, U}; done = truthy entries of S.done
//   legacy hubs localStorage["ai901hub.v1"]  = {done, plan, mistakes, mockHist}; done = truthy entries of done
//
// The hubs own these keys: site code must never write the `studyhub.` or `ai901hub.` prefixes,
// so this module only ever calls getItem(). Every access is defensive: storage can be blocked
// (throws SecurityError), missing, or hold hand-edited / truncated JSON.
import type { HubEntry } from './catalog';

export interface LocalProgress {
  /** Modules marked done, clamped to `total` when the catalog knows the module count. */
  done: number;
  total: number;
}

/** The legacy AI-901 hub's key, used if the catalog entry doesn't list its legacy keys. */
export const AI901_LEGACY_KEY = 'ai901hub.v1';

type Readable = Pick<Storage, 'getItem'>;

/** `window.localStorage`, or null when the browser blocks it (the getter itself can throw). */
export function browserStorage(): Readable | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** JSON.parse of `storage[key]`, or undefined when the key is missing, unreadable or not JSON. */
function readJson(storage: Readable, key: string): unknown {
  try {
    const raw = storage.getItem(key);
    return raw === null ? undefined : (JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

/** Number of truthy values in a `{moduleId: boolean}` map; anything that isn't a map counts as 0. */
function countDone(done: unknown): number {
  return isObject(done) ? Object.values(done).filter(Boolean).length : 0;
}

/** Which key holds this hub's progress, and how to find the `done` map inside it. */
function progressSource(hub: HubEntry): { key: string; doneOf: (record: Record<string, unknown>) => unknown } | null {
  if (hub.engine === 'v2') {
    const key = hub.storageKeys[0];
    return key ? { key, doneOf: (record) => (isObject(record.S) ? record.S.done : undefined) } : null;
  }
  if (hub.engine === 'legacy') {
    const key = hub.legacyKeys[0] ?? (hub.id === 'ai901' ? AI901_LEGACY_KEY : undefined);
    return key ? { key, doneOf: (record) => record.done } : null;
  }
  return null; // "static" or unknown engines: no known storage layout
}

/**
 * Local progress for one hub, or null when there is nothing (valid) to show:
 * no key, blocked storage, malformed JSON, or a v2 record without an `S` object.
 */
export function readLocalProgress(hub: HubEntry, storage: Readable | null = browserStorage()): LocalProgress | null {
  if (!storage) return null;
  const source = progressSource(hub);
  if (!source) return null;

  const record = readJson(storage, source.key);
  if (!isObject(record)) return null;
  if (hub.engine === 'v2' && !isObject(record.S)) return null;

  const done = countDone(source.doneOf(record));
  const total = hub.modules;
  return { done: total > 0 ? Math.min(done, total) : done, total };
}
