/**
 * Browser-storage key names and progress summaries.
 *
 * Pure functions only: no DOM and no global storage access. Helpers that read or write take a
 * `StorageLike` argument. The client imports this module directly (alias `@bridge-shared`) for
 * the catalog's "3 / 8 modules" badges, sign-in reconcile and logout, and the bridge outbox
 * reuses the payload builders, so both always build identical payloads. The record
 * shapes are documented in docs/hub-runtime-contract.md §3:
 *   studyhub.<id>.v2       {S, MOCKS, CARDS, U:{main,mocks,cards}}   (modern hubs)
 *   studyhub.<id>.mockrun  in-progress mock exam (local only)
 *   studyhub.codeLang      DSA code-tab language, shared by the DSA hubs
 *   ai901hub.v1            {done, plan, mistakes, mockHist}          (legacy AI-901)
 */

/** Prefix of every key a modern hub writes. Site code never writes it. */
export const HUB_PREFIX = "studyhub.";
/** Prefix of the legacy AI-901 key. Site code never writes it. */
export const LEGACY_PREFIX = "ai901hub.";
/** Prefix of the keys the bridge owns (owner tag, synced stamps, legacy sidecars, UI state). */
export const BRIDGE_PREFIX = "studyhubs.";
/** Bridge UI state; kept on logout. */
export const UI_PREFIX = "studyhubs.ui.";
export const OWNER_KEY = "studyhubs.owner";
export const CODE_LANG_KEY = "studyhub.codeLang";

export const PARTS = ["main", "mocks", "cards"] as const;
export type Part = (typeof PARTS)[number];
/** The hubs keep 40 mock results locally but sync only the last 25 (`MOCKS.slice(-25)`). */
export const SYNCED_MOCKS = 25;

export const progressKey = (hubId: string): string => `${HUB_PREFIX}${hubId}.v2`;
export const mockRunKey = (hubId: string): string => `${HUB_PREFIX}${hubId}.mockrun`;
export const syncedKey = (hubId: string): string => `${BRIDGE_PREFIX}synced.${hubId}`;
export const legacySidecarKey = (key: string): string => `${BRIDGE_PREFIX}legacy.${key}.upd`;
export const uiKey = (name: string): string => `${UI_PREFIX}${name}`;
/** Dismissal flag of the anonymous "sign in to keep it" notice. */
export const nudgeKey = (hubId: string): string => uiKey(`nudge.${hubId}`);

/** The catalog's `storageKeys` for a modern hub. */
export function storageKeysFor(hubId: string): string[] {
  return [progressKey(hubId), mockRunKey(hubId)];
}

/** True for keys written by hub code (as opposed to the bridge or the site shell). */
export function isHubKey(key: string, legacyKeys: readonly string[] = []): boolean {
  return key.indexOf(HUB_PREFIX) === 0 || key.indexOf(LEGACY_PREFIX) === 0 || legacyKeys.indexOf(key) >= 0;
}

export interface PartStamps {
  main: number;
  mocks: number;
  cards: number;
}

export interface HubRecord {
  S: Record<string, unknown>;
  MOCKS: unknown[];
  CARDS: Record<string, unknown>;
  U: PartStamps;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A positive safe-integer timestamp, else 0 (the hubs use Date.now() and 0 for "never"). */
function stamp(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function parseJson(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Parse a `studyhub.<id>.v2` value like the hub's loadLocal(): a record without `S` is ignored. */
export function parseHubRecord(raw: string | null | undefined): HubRecord | null {
  const o = parseJson(raw);
  if (!isObject(o) || !isObject(o.S)) return null;
  const U = isObject(o.U) ? o.U : {};
  return {
    S: o.S,
    MOCKS: Array.isArray(o.MOCKS) ? o.MOCKS : [],
    CARDS: isObject(o.CARDS) ? o.CARDS : {},
    U: { main: stamp(U.main), mocks: stamp(U.mocks), cards: stamp(U.cards) },
  };
}

/** Number of truthy entries in a `{id: bool}` map such as `S.done`. */
export function countDone(map: unknown): number {
  if (!isObject(map)) return 0;
  let n = 0;
  for (const k of Object.keys(map)) if (map[k]) n++;
  return n;
}

export interface ProgressSummary {
  /** Modules marked done (clamped to `total` when it is known). */
  done: number;
  /** Module count from the catalog, or null when unknown. */
  total: number | null;
  /** Newest local change (ms since epoch), or 0 when unknown. */
  updated: number;
}

function clampDone(done: number, total: number | null): number {
  return total != null && total >= 0 ? Math.min(done, total) : done;
}

/** Summary of a modern hub record: `S.done` count and newest `U` stamp. */
export function summarizeHub(raw: string | null | undefined, total: number | null = null): ProgressSummary | null {
  const rec = parseHubRecord(raw);
  if (!rec) return null;
  return {
    done: clampDone(countDone(rec.S.done), total),
    total,
    updated: Math.max(rec.U.main, rec.U.mocks, rec.U.cards),
  };
}

/** Summary of the legacy AI-901 record (`done` map); `updated` comes from the bridge sidecar. */
export function summarizeLegacy(
  raw: string | null | undefined,
  total: number | null = null,
  sidecar: string | null = null,
): ProgressSummary | null {
  const o = parseJson(raw);
  if (!isObject(o)) return null;
  return { done: clampDone(countDone(o.done), total), total, updated: stamp(Number(sidecar)) };
}

/** True once the learner has made progress in a modern hub (`U.main > 0`). */
export function hasMainProgress(raw: string | null | undefined): boolean {
  const rec = parseHubRecord(raw);
  return !!rec && rec.U.main > 0;
}

/** True once the legacy record holds anything the learner did. */
export function legacyHasProgress(raw: string | null | undefined): boolean {
  const o = parseJson(raw);
  if (!isObject(o)) return false;
  const nonEmpty = (v: unknown): boolean => Array.isArray(v) && v.length > 0;
  return countDone(o.done) > 0 || countDone(o.plan) > 0 || nonEmpty(o.mistakes) || nonEmpty(o.mockHist);
}

export type PartPayload =
  | { hub: string; upd: number; S: Record<string, unknown> }
  | { hub: string; upd: number; list: unknown[] }
  | { hub: string; upd: number; map: Record<string, unknown> };

/** The payload the hub's own `payload(part)` builds, rebuilt from the stored record (M1 outbox). */
export function buildPart(rec: HubRecord, part: Part, hubId: string): PartPayload | null {
  const upd = rec.U[part];
  if (!upd) return null;
  if (part === "main") return { hub: hubId, upd, S: rec.S };
  if (part === "mocks") return { hub: hubId, upd, list: rec.MOCKS.slice(-SYNCED_MOCKS) };
  return { hub: hubId, upd, map: rec.CARDS };
}

/** Parse `studyhubs.synced.<id>` (`{main, mocks, cards}` of acknowledged stamps). */
export function parseSynced(raw: string | null | undefined): PartStamps {
  const o = parseJson(raw);
  const s = isObject(o) ? o : {};
  return { main: stamp(s.main), mocks: stamp(s.mocks), cards: stamp(s.cards) };
}

/** Parts whose local stamp is newer than the last stamp the server acknowledged. */
export function dirtyParts(rec: HubRecord, synced: PartStamps): Part[] {
  return PARTS.filter((p) => rec.U[p] > synced[p]);
}

/**
 * Keys to remove from this browser on logout (M1): every hub key, every legacy key and every
 * bridge-owned key, except two preferences that hold no progress: `studyhubs.ui.*` and the
 * DSA hubs' shared code-language choice `studyhub.codeLang` (architecture-spec §4.6 step 7).
 */
export function keysToWipe(keys: Iterable<string>, legacyKeys: readonly string[] = []): string[] {
  const out: string[] = [];
  for (const k of keys) {
    if (k === CODE_LANG_KEY) continue;
    if (isHubKey(k, legacyKeys) || (k.indexOf(BRIDGE_PREFIX) === 0 && k.indexOf(UI_PREFIX) !== 0)) out.push(k);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Storage-taking helpers (M1). Shared by the bridge (which passes a wrapper that bypasses its own
// setItem hook) and the client shell (which passes window.localStorage).

/** The subset of the Web Storage API these helpers use. */
export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** A synced part: the three modern-hub parts, or `legacy` for AI-901-style hubs. */
export type AnyPart = Part | "legacy";

/** What these helpers need from a catalog entry. */
export interface HubRef {
  id: string;
  engine: string;
  legacyKeys?: readonly string[];
}

/** The legacy part's payload: the hub's whole storage value, verbatim. */
export interface LegacyPayload {
  hub: string;
  upd: number;
  key: string;
  raw: string;
}

/** Acknowledged stamps for every part, including `legacy` (all 0 when never synced). */
export type SyncedStamps = PartStamps & { legacy: number };

function safeGet(storage: StorageLike, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** Every key currently in `storage` (a snapshot, safe to mutate storage while iterating it). */
export function allKeys(storage: StorageLike): string[] {
  const out: string[] = [];
  try {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k !== null) out.push(k);
    }
  } catch {
    /* storage unavailable */
  }
  return out;
}

/** `studyhubs.synced.<id>` as stamps for all four parts. */
export function readSynced(storage: StorageLike, hubId: string): SyncedStamps {
  const raw = safeGet(storage, syncedKey(hubId));
  const o = parseJson(raw);
  const legacy = isObject(o) ? stamp(o.legacy) : 0;
  return { ...parseSynced(raw), legacy };
}

/** Record that the server holds `part` at `upd` or newer. Never moves a stamp backwards. */
export function markSynced(storage: StorageLike, hubId: string, part: AnyPart, upd: number): void {
  const cur = readSynced(storage, hubId);
  if (!(stamp(upd) > cur[part])) return;
  cur[part] = upd;
  try {
    storage.setItem(syncedKey(hubId), JSON.stringify(cur));
  } catch {
    /* storage full or unavailable: the part is simply re-sent later (newest-wins makes it a duplicate) */
  }
}

/** The account this browser's local progress belongs to (`publicId`), or null. */
export function readOwner(storage: StorageLike): string | null {
  return safeGet(storage, OWNER_KEY) || null;
}

export function writeOwner(storage: StorageLike, publicId: string): void {
  try {
    storage.setItem(OWNER_KEY, publicId);
  } catch {
    /* ignore */
  }
}

/**
 * The legacy part as stored right now: `{hub, upd: sidecar, key, raw}`, or null when the key is
 * empty, has no sidecar stamp, or does not hold a JSON object (the server would refuse it).
 */
export function legacyPart(storage: StorageLike, hubId: string, key: string): LegacyPayload | null {
  const raw = safeGet(storage, key);
  const upd = stamp(Number(safeGet(storage, legacySidecarKey(key))));
  return raw && upd && isObject(parseJson(raw)) ? { hub: hubId, upd, key, raw } : null;
}

/**
 * Payloads for the parts of one hub that are newer locally than the last acknowledged stamp,
 * exactly as the hub (or, for legacy hubs, the bridge) would send them. Static hubs have none.
 */
export function localHubParts(storage: StorageLike, hub: HubRef): Partial<Record<AnyPart, PartPayload | LegacyPayload>> {
  const out: Partial<Record<AnyPart, PartPayload | LegacyPayload>> = {};
  const synced = readSynced(storage, hub.id);
  if (hub.engine === "v2") {
    const rec = parseHubRecord(safeGet(storage, progressKey(hub.id)));
    if (!rec) return out;
    for (const part of dirtyParts(rec, synced)) {
      const payload = buildPart(rec, part, hub.id);
      if (payload) out[part] = payload;
    }
  } else if (hub.engine === "legacy") {
    const key = (hub.legacyKeys || [])[0];
    const part = key ? legacyPart(storage, hub.id, key) : null;
    if (part && part.upd > synced.legacy) out.legacy = part;
  }
  return out;
}

/** True when any hub in `hubs` has local progress the server has not acknowledged. */
export function hasDirtyProgress(storage: StorageLike, hubs: readonly HubRef[]): boolean {
  return hubs.some((h) => Object.keys(localHubParts(storage, h)).length > 0);
}

/** Logout / account-switch wipe: removes `keysToWipe` from storage and returns the removed keys. */
export function wipeKeys(storage: StorageLike, legacyKeys: readonly string[] = []): string[] {
  const keys = keysToWipe(allKeys(storage), legacyKeys);
  for (const k of keys) {
    try {
      storage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
  return keys;
}

// ---------------------------------------------------------------------------------------------
// Profile hint (M1): the signed-in menu shows the user's initial. The bridge caches it per
// publicId in `studyhubs.profile` (wiped on logout like every non-UI bridge key); the client
// shell may prime it at sign-in with writeProfile() so hub pages never need GET /api/me.

export const PROFILE_KEY = `${BRIDGE_PREFIX}profile`;

/** First letter of a display name or email, upper-cased ("" when there is none). */
export function initialOf(nameOrEmail: unknown): string {
  const s = typeof nameOrEmail === "string" ? nameOrEmail.trim() : "";
  const ch = s ? Array.from(s)[0] : "";
  return ch ? ch.toUpperCase() : "";
}

/** The cached initial for `publicId`, or null when absent or cached for another account. */
export function readProfile(storage: StorageLike, publicId: string): string | null {
  const o = parseJson(safeGet(storage, PROFILE_KEY));
  return isObject(o) && o.id === publicId && typeof o.initial === "string" && o.initial ? o.initial : null;
}

export function writeProfile(storage: StorageLike, publicId: string, nameOrEmail: unknown): void {
  const initial = initialOf(nameOrEmail);
  if (!initial) return;
  try {
    storage.setItem(PROFILE_KEY, JSON.stringify({ id: publicId, initial }));
  } catch {
    /* ignore */
  }
}
