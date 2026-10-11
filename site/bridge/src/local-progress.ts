/**
 * Browser-storage key names and progress summaries.
 *
 * Pure functions only (no DOM, no storage access), so the client copies this logic for the
 * catalog's "3 / 8 modules" badges and M1's outbox reuses the payload builders. The record
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
 * bridge-owned key except `studyhubs.ui.*`, which holds UI preferences only.
 */
export function keysToWipe(keys: Iterable<string>, legacyKeys: readonly string[] = []): string[] {
  const out: string[] = [];
  for (const k of keys) {
    if (isHubKey(k, legacyKeys) || (k.indexOf(BRIDGE_PREFIX) === 0 && k.indexOf(UI_PREFIX) !== 0)) out.push(k);
  }
  return out;
}
