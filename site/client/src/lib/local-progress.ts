// Read-only summary of the progress a hub keeps in this browser's localStorage, for the catalog
// cards and the account page. The record shapes and parsing live in the bridge's shared module
// (`@bridge-shared`, build-contracts.md §13), so the shell and the bridge always agree:
//   v2 hubs     localStorage[storageKeys[0]] = {S, MOCKS, CARDS, U}; done = truthy entries of S.done
//   legacy hubs localStorage["ai901hub.v1"]  = {done, plan, mistakes, mockHist}; done = truthy entries of done
//
// The hubs own these keys: site code never writes the `studyhub.` or `ai901hub.` prefixes. This
// module only reads; every access is defensive (storage can be blocked, missing or hand-edited).
import { summarizeHub, summarizeLegacy, type StorageLike } from '@bridge-shared';
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
  return localStore();
}

/** `window.localStorage` as the shared helpers' `StorageLike`, or null when it is blocked. */
export function localStore(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function read(storage: Readable, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** The legacy progress key of a hub (its first legacy key, or AI-901's well-known one). */
export function legacyKeyOf(hub: Pick<HubEntry, 'id' | 'legacyKeys'>): string | undefined {
  return hub.legacyKeys[0] ?? (hub.id === 'ai901' ? AI901_LEGACY_KEY : undefined);
}

/**
 * Local progress for one hub, or null when there is nothing (valid) to show:
 * no key, blocked storage, malformed JSON, or a v2 record without an `S` object.
 */
export function readLocalProgress(hub: HubEntry, storage: Readable | null = browserStorage()): LocalProgress | null {
  if (!storage) return null;
  const total = hub.modules > 0 ? hub.modules : null;
  let summary = null;
  if (hub.engine === 'v2') {
    const key = hub.storageKeys[0];
    summary = key ? summarizeHub(read(storage, key), total) : null;
  } else if (hub.engine === 'legacy') {
    const key = legacyKeyOf(hub);
    summary = key ? summarizeLegacy(read(storage, key), total) : null;
  }
  // "static" or unknown engines: no known storage layout.
  return summary ? { done: summary.done, total: hub.modules } : null;
}
