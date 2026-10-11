/** Public shapes of the bridge (window.claude and window.__studyhubsBridge). */
import type { Engine } from "./config";
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
  /** M0 is always "anonymous". M1 adds "signed-in" and "mismatch". */
  mode: "anonymous";
  /** Whether the readable `sh_hint` cookie was present at boot. */
  hint: boolean;
  /** Requests made by the bridge. Always 0 in anonymous mode (contract §6). */
  network: number;
  ai: { calls: number; jsonCalls: number; modalOpens: number; modalOpen: boolean };
  storage: StorageHookStats & { hooked: boolean; loggedOut: boolean };
  chrome: { mounted: boolean; notices: string[] };
  legacy: { seedCalls: number; signedIn: boolean | null };
  outbox: OutboxStats;
}

/** `window.__studyhubsBridge` (contract §6). */
export interface BridgeApi {
  readonly version: string;
  /** Called by /api/seed/<hubId>.js on legacy hubs. `{signedIn:false}` is a no-op. */
  legacySeed(seed: unknown): void;
  /** Push pending progress now. Nothing is ever pending in M0, so it resolves at once. */
  flushNow(): Promise<void>;
  /** A fresh snapshot of counters and UI state, for e2e tests and debugging. */
  stats(): BridgeStats;
}
