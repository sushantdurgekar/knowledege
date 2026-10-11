/**
 * Legacy hubs (AI-901): no window.claude, a single localStorage record read once at parse time.
 *
 * The server injects, right after the bridge, a blocking per-visitor seed script
 * `/api/seed/<hubId>.js` that calls `__studyhubsBridge.legacySeed(seed)` before the hub reads
 * its storage. In M0 every visitor is anonymous and the seed is `{signedIn:false}`: a no-op,
 * because the hub's own local record is the only copy. The sidecar stamps that make
 * newest-wins work at first sign-in are written by the storage hook (storage-hook.ts).
 *
 * TODO(M1): signed-in seeds `{signedIn:true, publicId, policy, parts:{legacy:{upd, raw}}}`:
 *   apply-remote → write `raw` with the ORIGINAL setItem (store.set) plus the sidecar;
 *   push-local   → queue part `legacy = {hub, key, upd, raw}` in the outbox (merge on first login);
 *   and mirror later legacy writes from the storage hook into the outbox.
 */
import type { BridgeConfig } from "./config";
import type { RawStore } from "./storage-hook";

export interface LegacyPart {
  upd: number;
  raw: string;
}

export interface LegacySeed {
  signedIn: boolean;
  publicId?: string;
  policy?: unknown;
  parts?: { legacy?: LegacyPart };
}

export type LegacyPlan =
  | { action: "none" }
  | { action: "apply-remote"; upd: number; raw: string }
  | { action: "push-local"; upd: number; raw: string };

/**
 * Newest-wins decision for one legacy key at seed time (spec §4.5 "Legacy"). A local record
 * without a sidecar counts as stamp 1: older than any server copy, newer than none.
 */
export function planLegacySeed(
  local: { raw: string | null; sidecar: number },
  remote: LegacyPart | null | undefined,
  now: number,
): LegacyPlan {
  const localUpd = local.sidecar > 0 ? local.sidecar : local.raw != null ? 1 : 0;
  if (remote && remote.upd > localUpd) return { action: "apply-remote", upd: remote.upd, raw: remote.raw };
  if (local.raw != null && (!remote || localUpd > remote.upd)) {
    return { action: "push-local", upd: local.sidecar > 0 ? local.sidecar : now, raw: local.raw };
  }
  return { action: "none" };
}

/** Validate an untrusted seed object (it comes from a script response). */
export function parseLegacySeed(input: unknown): LegacySeed | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  if (typeof o.signedIn !== "boolean") return null;
  return o as unknown as LegacySeed;
}

export interface LegacyStats {
  seedCalls: number;
  /** signedIn of the last valid seed, or null before any seed arrived. */
  signedIn: boolean | null;
}

export interface Legacy {
  seed(input: unknown): void;
  stats(): LegacyStats;
}

export function createLegacy(cfg: Pick<BridgeConfig, "legacyKeys">, store: RawStore): Legacy {
  const counters: LegacyStats = { seedCalls: 0, signedIn: null };
  return {
    seed(input) {
      counters.seedCalls++;
      const seed = parseLegacySeed(input);
      if (!seed) return;
      counters.signedIn = seed.signedIn;
      if (!seed.signedIn) return; // anonymous: the hub keeps using its local record as-is
      // TODO(M1): for each cfg.legacyKeys run planLegacySeed() against store/sidecar and act on it.
      void cfg;
      void store;
    },
    stats: () => ({ ...counters }),
  };
}
