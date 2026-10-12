// The catalog as the sync helpers see it (id, engine, legacy keys), plus the "download my
// unsynced progress" file. The storage logic itself is the bridge's shared module.
import {
  allKeys,
  localHubParts,
  type AnyPart,
  type HubRef,
  type LegacyPayload,
  type PartPayload,
  type StorageLike,
} from '@bridge-shared';
import { fetchCatalog, type HubEntry } from './catalog';
import { AI901_LEGACY_KEY, legacyKeyOf } from './local-progress';

export interface SyncHub extends HubRef {
  title: string;
  legacyKeys: readonly string[];
}

/** The catalog entries that can sync (v2 and legacy engines), as `HubRef`s. */
export function syncHubs(hubs: readonly HubEntry[]): SyncHub[] {
  const out: SyncHub[] = [];
  for (const hub of hubs) {
    if (hub.engine === 'v2') out.push({ id: hub.id, engine: 'v2', legacyKeys: hub.legacyKeys, title: hub.title });
    else if (hub.engine === 'legacy') {
      const key = legacyKeyOf(hub);
      if (key) out.push({ id: hub.id, engine: 'legacy', legacyKeys: [key], title: hub.title });
    }
  }
  return out;
}

/** Every legacy key the catalog knows, for `wipeKeys` (AI-901's key is always included). */
export function allLegacyKeys(hubs: readonly Pick<HubRef, 'legacyKeys'>[]): string[] {
  const keys = new Set<string>([AI901_LEGACY_KEY]);
  for (const hub of hubs) for (const key of hub.legacyKeys ?? []) keys.add(key);
  return [...keys];
}

const V2_KEY_RE = /^studyhub\.([a-z0-9][a-z0-9-]*)\.v2$/;

/**
 * Hubs that have progress in this browser, read from the key names alone. Only used to decide
 * whether anything is unsynced (or to export it) when the catalog cannot be loaded; never to sync.
 */
export function hubsFromStorage(storage: StorageLike): SyncHub[] {
  const out: SyncHub[] = [];
  for (const key of allKeys(storage)) {
    const match = V2_KEY_RE.exec(key);
    if (match?.[1]) out.push({ id: match[1], engine: 'v2', legacyKeys: [], title: match[1] });
    else if (key === AI901_LEGACY_KEY)
      out.push({ id: 'ai901', engine: 'legacy', legacyKeys: [AI901_LEGACY_KEY], title: 'AI-901' });
  }
  return out;
}

export interface LoadedHubs {
  hubs: SyncHub[];
  /** False when /catalog.json failed and `hubs` comes from the storage key names. */
  fromCatalog: boolean;
}

/** The syncable hubs from /catalog.json, or (if it fails) the ones this browser has keys for. */
export async function loadSyncHubs(storage: StorageLike): Promise<LoadedHubs> {
  try {
    return { hubs: syncHubs(await fetchCatalog()), fromCatalog: true };
  } catch {
    return { hubs: hubsFromStorage(storage), fromCatalog: false };
  }
}

export type UnsyncedParts = Partial<Record<AnyPart, PartPayload | LegacyPayload>>;

/** `{hubId: {part: payload}}` for every hub part the server has not acknowledged. */
export function unsyncedParts(storage: StorageLike, hubs: readonly HubRef[]): Record<string, UnsyncedParts> {
  const out: Record<string, UnsyncedParts> = {};
  for (const hub of hubs) {
    const parts = localHubParts(storage, hub);
    if (Object.keys(parts).length > 0) out[hub.id] = parts;
  }
  return out;
}

/** Number of unsynced parts across `hubs`. */
export function countUnsynced(storage: StorageLike, hubs: readonly HubRef[]): number {
  let n = 0;
  for (const hub of hubs) n += Object.keys(localHubParts(storage, hub)).length;
  return n;
}

export const EXPORT_FORMAT = 'study-hubs-unsynced-progress';

/** The JSON document behind "Download unsynced progress (.json)". */
export function unsyncedExport(storage: StorageLike, hubs: readonly SyncHub[], now = new Date()) {
  const parts = unsyncedParts(storage, hubs);
  return {
    format: EXPORT_FORMAT,
    version: 1,
    exportedAt: now.toISOString(),
    origin: typeof window !== 'undefined' ? window.location.origin : '',
    hubs: Object.fromEntries(
      Object.entries(parts).map(([id, hubParts]) => [
        id,
        { title: hubs.find((hub) => hub.id === id)?.title ?? id, parts: hubParts },
      ]),
    ),
  };
}

export function exportFileName(now = new Date()): string {
  return `study-hubs-unsynced-progress-${now.toISOString().slice(0, 10)}.json`;
}

/** Save `data` as a JSON file through a temporary object URL. */
export function downloadJson(fileName: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Download every unsynced part in `hubs` as one JSON file. */
export function downloadUnsynced(storage: StorageLike, hubs: readonly SyncHub[]): void {
  const now = new Date();
  downloadJson(exportFileName(now), unsyncedExport(storage, hubs, now));
}
