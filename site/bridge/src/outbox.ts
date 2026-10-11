/**
 * Outbox: batches the hub's part writes into one `/api/sync` request per flush.
 *
 * M0 has nothing to send (anonymous visitors keep progress in localStorage only), so the
 * outbox is inert: flushNow() resolves at once and no listener or timer is installed.
 *
 * TODO(M1) (spec §4.5 "Flush policy" and "Acknowledgement"):
 *  - pending parts + waiters (set() resolves once a flush carrying upd ≥ its upd is acked);
 *  - freshen() from the storage hook's LKEY writes (rebuild payloads with local-progress.buildPart);
 *  - tier timers from the server policy, backoff 15 s → 10 min, honour Retry-After / retryAt;
 *  - visibilitychange/pagehide/freeze/online listeners and BroadcastChannel("studyhubs") flush;
 *  - unload: dedupe by body, keepalive ≤ 60,000 B, else window.__shFflate.gzipSync
 *    (lazy-load /_sh/fflate.js once the pending body passes 48 KB);
 *  - acked stamps in `studyhubs.synced.<hubId>`.
 */

/** Sync policy pushed by the server with every progress response (M1). */
export interface SyncPolicy {
  tier: 1 | 2 | 3 | "paused";
  flushMs: number;
  hiddenMinMs: number;
  refreshMs: number;
  pausedUntil: number | null;
}

/** Tier-1 defaults (spec §4.5 table). */
export const DEFAULT_POLICY: Readonly<SyncPolicy> = Object.freeze({
  tier: 1,
  flushMs: 120_000,
  hiddenMinMs: 0,
  refreshMs: 60_000,
  pausedUntil: null,
});

export interface OutboxStats {
  pending: number;
  flushes: number;
  errors: number;
  lastError: string | null;
}

export interface Outbox {
  flushNow(): Promise<void>;
  stats(): OutboxStats;
  dispose(): void;
}

export function createOutbox(): Outbox {
  return {
    flushNow: () => Promise.resolve(),
    stats: () => ({ pending: 0, flushes: 0, errors: 0, lastError: null }),
    dispose: () => undefined,
  };
}
