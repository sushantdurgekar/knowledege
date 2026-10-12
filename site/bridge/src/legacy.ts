/**
 * Legacy hubs (AI-901): no window.claude, a single localStorage record read once at parse time.
 *
 * The server injects, right after the bridge, a blocking per-visitor seed script
 * `/api/seed/<hubId>.js` that calls `__studyhubsBridge.legacySeed(seed)` BEFORE the hub reads
 * its storage (build-contracts §10, §13):
 *   {signedIn:false}                                   anonymous: nothing to do (a stale sh_hint is cleared)
 *   {signedIn:true, publicId, policy, parts:{legacy:{upd, raw}} | {}}
 * Signed in, after the owner check (a browser holding another account's progress is left alone):
 *   - remote newer than the local sidecar stamp → write `raw` with the ORIGINAL setItem (the hub
 *     then loads it) and set the sidecar to remote.upd;
 *   - else local exists and is newer → it is queued as part `legacy` (merge at first sign-in);
 *   - from then on every hub write of the key (sidecar = Date.now(), by the storage hook) is
 *     queued, and a tab that becomes visible after policy.refreshMs checks the server for a newer
 *     copy and offers a reload (sync.ts). It never reloads by itself.
 */
import type { BridgeConfig } from "./config";
import { legacySidecarKey, markSynced, type StorageLike } from "./local-progress";
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

function remoteOf(seed: LegacySeed): LegacyPart | null {
  const r = seed.parts && typeof seed.parts === "object" ? seed.parts.legacy : null;
  return r && typeof r.upd === "number" && r.upd > 0 && typeof r.raw === "string" ? r : null;
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

export interface LegacyDeps {
  cfg: Pick<BridgeConfig, "hubId" | "legacyKeys">;
  /** Bridge-owned storage access (the ORIGINAL setItem, no hook events). */
  store: RawStore & StorageLike;
  now?: () => number;
  /** The seed says nobody is signed in. */
  signedOut(): void;
  /** Owner check (and first-sign-in claim) for `publicId`; false when the local data belongs to another account. */
  claim(publicId: string): boolean;
  /** Start syncing the legacy part; the server holds it at `known` (0 = not at all). */
  start(known: number, policy: unknown, publicId: string): void;
}

export function createLegacy(d: LegacyDeps): Legacy {
  const counters: LegacyStats = { seedCalls: 0, signedIn: null };
  const now = d.now || Date.now;
  return {
    seed(input) {
      counters.seedCalls++;
      const seed = parseLegacySeed(input);
      if (!seed) return;
      counters.signedIn = seed.signedIn;
      if (!seed.signedIn) return d.signedOut();
      const key = d.cfg.legacyKeys[0];
      const pid = seed.publicId;
      if (counters.seedCalls > 1 || !key || typeof pid !== "string" || !pid || !d.claim(pid)) return;
      const side = legacySidecarKey(key);
      const remote = remoteOf(seed);
      const sidecar = Number(d.store.get(side)) || 0;
      const plan = planLegacySeed({ raw: d.store.get(key), sidecar }, remote, now());
      if (plan.action === "apply-remote") {
        if (d.store.set(key, plan.raw)) {
          d.store.set(side, String(plan.upd));
          markSynced(d.store, d.cfg.hubId, "legacy", plan.upd);
        }
      } else if (plan.action === "push-local") {
        if (!sidecar) d.store.set(side, String(plan.upd));
      } else if (remote && sidecar && remote.upd >= sidecar) {
        markSynced(d.store, d.cfg.hubId, "legacy", sidecar);
      }
      d.start(remote ? remote.upd : 0, seed.policy, pid);
    },
    stats: () => ({ ...counters }),
  };
}
