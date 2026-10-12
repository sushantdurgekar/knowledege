/** Public shapes of the bridge (window.claude and window.__studyhubsBridge). */
import type { Mode } from "./auth-events";
import type { Engine } from "./config";
import type { PartStamps } from "./local-progress";
import type { OutboxStats } from "./outbox";
import type { StorageHookStats } from "./storage-hook";

/** What the hubs see as `window.claude` (frozen). Only `use(name)` is ever called by a hub. */
export interface ClaudeShim {
  readonly use: (name: string) => Promise<unknown>;
}

export interface BridgeStats {
  version: string;
  hubId: string;
  slug: string;
  engine: Engine;
  /** "anonymous" (no sh_hint, or the server said signed out), "signed-in", or "mismatch" (owner tag differs). */
  mode: Mode;
  /** Whether the readable `sh_hint` cookie was present at boot. */
  hint: boolean;
  /** Requests made by the bridge (fetches plus the lazy fflate script). Always 0 in anonymous mode (contract §6). */
  network: number;
  ai: { calls: number; jsonCalls: number; modalOpens: number; modalOpen: boolean };
  storage: StorageHookStats & { hooked: boolean; loggedOut: boolean };
  chrome: { mounted: boolean; notices: string[] };
  legacy: { seedCalls: number; signedIn: boolean | null };
  outbox: OutboxStats;
  /** Signed-in sync state, or null when this page never synced (anonymous, mismatch, no seed). */
  sync: { ready: boolean; active: boolean; fetches: number; tabU: PartStamps } | null;
}

/** `window.__studyhubsBridge` (contract §6). */
export interface BridgeApi {
  readonly version: string;
  /** Called by /api/seed/<hubId>.js on legacy hubs, before the hub reads its storage. */
  legacySeed(seed: unknown): void;
  /** Push pending progress now (ignores the flush timer and backoff); resolves when the request settles. */
  flushNow(): Promise<void>;
  /** A fresh snapshot of counters and UI state, for e2e tests and debugging. */
  stats(): BridgeStats;
}
