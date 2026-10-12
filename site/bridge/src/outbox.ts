/**
 * Outbox: batches the hub's part writes into one `POST /api/sync` per flush (build-contracts §13,
 * spec §4.5 "Flush policy" and "Acknowledgement").
 *
 *  - pending: the newest unsent payload per part. freshen() rebuilds payloads from this tab's
 *    localStorage record at flush time (and on every own LKEY write), so a change made inside
 *    the hub's 1.2 s debounce still goes out.
 *  - waiters: a hub set() resolves only when the server acknowledges a flush carrying
 *    upd ≥ its upd (accepted / duplicate / stale), and rejects with the mapped code on failure.
 *  - timers: flushMs anchored at the first unsent change; hidden flush per hiddenMinMs;
 *    pagehide/freeze always flush; failures back off 15 s → 10 min, honouring Retry-After /
 *    retryAt (sync_paused adds 0–10 min of jitter; clock_skew retries every 10 min).
 *  - at most one request in flight. The single exception is an unload flush whose body differs
 *    from the one in flight: a page that is going away cannot wait (the in-flight fetch may be
 *    cancelled with it), and the server's newest-wins transaction makes the overlap harmless.
 *  - unload: keepalive when the body is ≤ 60,000 B; larger bodies are gzipped with
 *    window.__shFflate (lazy-loaded once the pending body passes 48 KB), else sent normally.
 */
import { markSynced, type AnyPart, type LegacyPayload, type PartPayload, type StorageLike } from "./local-progress";
import {
  GZIP_PRELOAD_BYTES,
  KEEPALIVE_MAX_BYTES,
  codeForResponse,
  utf8Length,
  type HubErrorCode,
  type Reply,
  type Transport,
} from "./transport";
import { codedError } from "./util";

export type Payload = PartPayload | LegacyPayload;

/** Sync policy pushed by the server with every progress, sync and me response. */
export interface SyncPolicy {
  tier: 1 | 2 | 3 | "paused";
  flushMs: number;
  hiddenMinMs: number;
  refreshMs: number;
  /** ms since epoch, or null. */
  pausedUntil: number | null;
}

/** Tier-1 defaults (spec §4.5 table), used until the server sends a policy. */
export const DEFAULT_POLICY: Readonly<SyncPolicy> = Object.freeze({
  tier: 1,
  flushMs: 120_000,
  hiddenMinMs: 0,
  refreshMs: 60_000,
  pausedUntil: null,
});

export const MIN_BACKOFF_MS = 15_000;
export const MAX_BACKOFF_MS = 600_000;
export const SKEW_RETRY_MS = 600_000;
export const PAUSE_JITTER_MS = 600_000;
const MAX_TIMER_MS = 2_147_483_647;

/** Validate a policy from the wire; anything missing or out of range keeps the previous value. */
export function parsePolicy(input: unknown, prev: SyncPolicy): SyncPolicy {
  if (!input || typeof input !== "object") return prev;
  const o = input as Record<string, unknown>;
  const ms = (v: unknown, min: number, fallback: number): number =>
    typeof v === "number" && v >= min && v <= 86_400_000 ? v : fallback;
  const t = o.tier;
  const until = typeof o.pausedUntil === "string" ? Date.parse(o.pausedUntil) : NaN;
  return {
    tier: t === 1 || t === 2 || t === 3 || t === "paused" ? t : prev.tier,
    flushMs: ms(o.flushMs, 1000, prev.flushMs),
    hiddenMinMs: ms(o.hiddenMinMs, 0, prev.hiddenMinMs),
    refreshMs: ms(o.refreshMs, 1000, prev.refreshMs),
    pausedUntil: until > 0 ? until : null,
  };
}

export type OutboxEvent =
  /** A flush succeeded; `clean` when every part in it was settled without a rejection. */
  | { type: "ok"; clean: boolean }
  | { type: "paused"; until: number }
  | { type: "skew" }
  | { type: "maintenance"; until: number }
  | { type: "too_large" }
  /** 401/403/invalid: sync is off for this page. */
  | { type: "stopped"; code: HubErrorCode };

export interface OutboxDeps {
  hubId: string;
  /** main/mocks/cards for v2 hubs, legacy for AI-901. */
  parts: readonly AnyPart[];
  /** The part as this browser stores it right now (rebuilt like the hub's payload()), or null. */
  local(part: AnyPart): Payload | null;
  transport: Transport;
  /** Where `studyhubs.synced.<hubId>` is kept. */
  storage: StorageLike;
  /** window.__shFflate.gzipSync once /_sh/fflate.js has loaded, else null. */
  gzip(): ((data: Uint8Array) => Uint8Array) | null;
  /** Start loading /_sh/fflate.js (called once, when the pending body passes 48 KB). */
  loadGzip(): void;
  now?: () => number;
  random?: () => number;
  /** A part the server acknowledged (accepted/duplicate): the db cache adopts `sent`. */
  onAck?(part: AnyPart, sent: Payload): void;
  /** The server holds something newer: the next get() should refetch. */
  onStale?(): void;
  onEvent?(event: OutboxEvent): void;
}

export interface OutboxStats {
  /** Number of parts waiting to be sent. */
  pending: number;
  parts: string[];
  flushes: number;
  errors: number;
  /** Server error code (or HTTP status / "network") of the last failure; null after a success. */
  lastError: string | null;
  inflight: boolean;
  /** No timer flush before this time (ms since epoch); 0 when not backing off. */
  retryAt: number;
  tier: SyncPolicy["tier"];
  acked: Record<string, number>;
  known: Record<string, number>;
  /** Set once sync is off for this page ("revoked", "not_granted", "invalid_argument"). */
  dead: HubErrorCode | null;
}

/** "timer": policy-driven (respects backoff); "force": flushNow/broadcast; "unload": hidden/pagehide/freeze. */
export type FlushKind = "timer" | "force" | "unload";

export interface Outbox {
  /** Newest server stamp seen per part (progress replies and acknowledgements). */
  readonly known: Record<string, number>;
  /** Newest stamp the server acknowledged for this tab's sends. */
  readonly acked: Record<string, number>;
  policy(): SyncPolicy;
  setPolicy(input: unknown): void;
  /** Sync is live (the hub holds the db, or a legacy seed arrived): freshen and arm. */
  start(): void;
  /** The hub's set(): resolves once a flush carrying upd ≥ payload.upd is acknowledged. */
  set(part: AnyPart, payload: Payload): Promise<void>;
  pendingPart(part: AnyPart): Payload | undefined;
  /** The server already holds `part` at `upd` or newer: drop an older pending payload, resolve its waiters. */
  dropStale(part: AnyPart, upd: number): void;
  /** Rebuild pending payloads from local storage (own LKEY write, flush time). */
  freshen(): void;
  arm(): void;
  flush(kind: FlushKind): Promise<void>;
  /** visibilitychange → hidden. */
  onHidden(): void;
  /** online, or visible again: retry once the backoff has passed. */
  retry(): void;
  /** Turn sync off for this page and reject every waiter with `code`. */
  stop(code: HubErrorCode): void;
  dead(): HubErrorCode | null;
  stats(): OutboxStats;
  dispose(): void;
}

interface Waiter {
  part: AnyPart;
  upd: number;
  resolve(): void;
  reject(e: Error): void;
}

const DONE: Promise<void> = Promise.resolve();

export function createOutbox(d: OutboxDeps): Outbox {
  const now = d.now || Date.now;
  const random = d.random || Math.random;
  const known: Record<string, number> = {};
  const acked: Record<string, number> = {};
  const pending: Partial<Record<AnyPart, Payload>> = {};
  /** Parts the server rejected (too large / invalid): only the hub's own next set() re-queues them. */
  const blocked: Partial<Record<AnyPart, boolean>> = {};
  let waiters: Waiter[] = [];
  let policy: SyncPolicy = { ...DEFAULT_POLICY };
  let started = false;
  let dead: HubErrorCode | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let firstDirtyAt = 0;
  let retryAt = 0;
  /** The server told us when to come back (sync_paused, clock_skew): unload flushes wait too. */
  let hold = false;
  let failing = false;
  let backoff = 0;
  let lastSuccessAt = 0;
  let inflight: Promise<void> | null = null;
  let inflightBody = "";
  let gzipAsked = false;
  let flushes = 0;
  let errors = 0;
  let lastError: string | null = null;

  const emit = (e: OutboxEvent): void => {
    if (d.onEvent) d.onEvent(e);
  };
  const have = (p: AnyPart): number => Math.max(known[p] || 0, acked[p] || 0, pending[p] ? pending[p]!.upd : 0);
  const dirty = (): AnyPart[] => Object.keys(pending) as AnyPart[];

  function put(p: AnyPart, payload: Payload): void {
    if (!firstDirtyAt) firstDirtyAt = now();
    pending[p] = payload;
  }

  /** Resolve `part`'s waiters up to `upd`, or (with `code`) reject them; `part` null = every part. */
  function settle(part: AnyPart | null, upd: number, code?: HubErrorCode): void {
    waiters = waiters.filter((w) => {
      if (part && w.part !== part) return true;
      if (code) w.reject(codedError(code, `sync: ${code}`));
      else if (w.upd <= upd) w.resolve();
      else return true;
      return false;
    });
  }

  function dropIfOlder(p: AnyPart, upd: number): void {
    if (pending[p] && pending[p]!.upd <= upd) delete pending[p];
  }

  function clearTimer(): void {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  function preloadGzip(): void {
    if (gzipAsked) return;
    gzipAsked = true;
    d.loadGzip();
  }

  function freshen(): void {
    if (!started || dead) return;
    for (const p of d.parts) {
      if (blocked[p]) continue;
      const loc = d.local(p);
      if (loc && loc.upd > have(p)) put(p, loc);
    }
    if (!gzipAsked && dirty().length && JSON.stringify(pending).length > GZIP_PRELOAD_BYTES) preloadGzip();
  }

  function arm(): void {
    if (timer !== undefined || dead || !started || !dirty().length) return;
    const t = now();
    const due = failing ? retryAt : (firstDirtyAt || t) + policy.flushMs;
    timer = setTimeout(
      () => {
        timer = undefined;
        void flush("timer");
      },
      Math.min(Math.max(due - t, 0), MAX_TIMER_MS),
    );
  }

  /** Hold every flush until `until` (+ jitter); waiters learn "unavailable" now. */
  function pause(until: number): void {
    failing = hold = true;
    retryAt = until + Math.floor(random() * PAUSE_JITTER_MS);
    settle(null, 0, "unavailable");
    emit({ type: "paused", until: retryAt });
  }

  function onReply(r: Reply, sent: Partial<Record<AnyPart, Payload>>): void {
    const t = now();
    const body = r.body;
    if (body && body.policy) policy = parsePolicy(body.policy, policy);
    const results = r.status === 200 && body && body.results && body.results[d.hubId];
    if (!results || typeof results !== "object") return fail(r, sent, t);
    let clean = true;
    for (const p of Object.keys(sent) as AnyPart[]) {
      const s = sent[p]!;
      const x = results[p] || {};
      const upd = typeof x.upd === "number" ? x.upd : 0;
      if (x.status === "accepted" || x.status === "duplicate") {
        const u = Math.max(upd, s.upd);
        acked[p] = Math.max(acked[p] || 0, u);
        known[p] = Math.max(known[p] || 0, u);
        markSynced(d.storage, d.hubId, p, s.upd);
        if (d.onAck) d.onAck(p, s);
        dropIfOlder(p, u);
        settle(p, u);
      } else if (x.status === "stale") {
        const u = Math.max(upd, s.upd);
        known[p] = Math.max(known[p] || 0, upd);
        markSynced(d.storage, d.hubId, p, s.upd);
        dropIfOlder(p, u);
        if (d.onStale) d.onStale();
        settle(p, u);
      } else if (x.status === "rejected") {
        clean = false;
        reject(p, s, x.code === "too_large" ? "quota_exceeded" : "invalid_argument");
      } else {
        clean = false; // no verdict for this part: it stays pending for the next flush
      }
    }
    failing = hold = false;
    retryAt = backoff = 0;
    lastSuccessAt = t;
    lastError = null;
    emit({ type: "ok", clean });
  }

  /** The server refused this part for good (too large / invalid): drop it until the hub retries. */
  function reject(p: AnyPart, s: Payload, code: HubErrorCode): void {
    dropIfOlder(p, s.upd);
    blocked[p] = true;
    settle(p, 0, code);
    if (code === "quota_exceeded") emit({ type: "too_large" });
  }

  function fail(r: Reply, sent: Partial<Record<AnyPart, Payload>>, t: number): void {
    const code = r.body && typeof r.body.code === "string" ? r.body.code : "";
    const hubCode = codeForResponse(r.status, code);
    errors++;
    lastError = code || (r.status ? String(r.status) : "network");
    if (hubCode === "quota_exceeded") {
      for (const p of Object.keys(sent) as AnyPart[]) reject(p, sent[p]!, hubCode);
      return;
    }
    if (hubCode !== "unavailable") {
      stop(hubCode);
      emit({ type: "stopped", code: hubCode });
      return;
    }
    backoff = backoff ? Math.min(backoff * 2, MAX_BACKOFF_MS) : MIN_BACKOFF_MS;
    if (r.status === 429 && code === "sync_paused") return pause(r.retryAt || t + backoff);
    failing = true;
    if (r.status === 422) {
      hold = true;
      retryAt = t + SKEW_RETRY_MS;
      emit({ type: "skew" });
    } else {
      retryAt = r.retryAt > t ? r.retryAt : t + backoff;
      if (r.status === 503 && code === "maintenance") emit({ type: "maintenance", until: r.retryAt });
    }
    settle(null, 0, "unavailable");
  }

  function flush(kind: FlushKind): Promise<void> {
    if (!started || dead) return DONE;
    freshen();
    if (!dirty().length) return DONE;
    const t = now();
    const unloading = kind === "unload";
    if (kind !== "force") {
      if (policy.tier === "paused" && policy.pausedUntil && policy.pausedUntil > t && !hold) pause(policy.pausedUntil);
      if (t < retryAt && (hold || !unloading)) {
        if (!unloading) arm();
        return DONE;
      }
    }
    const sent: Partial<Record<AnyPart, Payload>> = { ...pending };
    const body = JSON.stringify({ hubs: { [d.hubId]: sent } });
    if (inflight) {
      if (kind === "force") return inflight.then(() => flush("force"));
      if (!unloading || body === inflightBody) return inflight;
    }
    clearTimer();
    const size = utf8Length(body);
    if (size > GZIP_PRELOAD_BYTES) preloadGzip();
    let wire: string | Uint8Array = body;
    const gzip = size > KEEPALIVE_MAX_BYTES ? d.gzip() : null;
    if (gzip) {
      try {
        wire = gzip(new TextEncoder().encode(body));
      } catch {
        wire = body;
      }
    }
    const wireSize = typeof wire === "string" ? size : wire.length;
    firstDirtyAt = 0;
    flushes++;
    const req: Promise<void> = d.transport
      .request("POST", "/sync", { body: wire, keepalive: unloading && wireSize <= KEEPALIVE_MAX_BYTES })
      .then((r) => onReply(r, sent))
      .then(() => {
        if (inflight === req) {
          inflight = null;
          inflightBody = "";
        }
        arm();
      });
    inflight = req;
    inflightBody = body;
    return req;
  }

  function stop(code: HubErrorCode): void {
    dead = code;
    clearTimer();
    settle(null, 0, code);
  }

  return {
    known,
    acked,
    policy: () => policy,
    setPolicy(input) {
      const prev = policy.flushMs;
      policy = parsePolicy(input, policy);
      if (policy.flushMs !== prev && timer !== undefined) {
        clearTimer();
        arm();
      }
    },
    start() {
      started = true;
      freshen();
      arm();
    },
    set(part, payload) {
      if (dead) return Promise.reject(codedError(dead, `sync: ${dead}`));
      if (payload.upd <= Math.max(acked[part] || 0, known[part] || 0)) return DONE;
      delete blocked[part];
      freshen();
      if (!pending[part] || pending[part]!.upd < payload.upd) put(part, payload);
      arm();
      return new Promise<void>((resolve, rejectFn) => {
        waiters.push({ part, upd: payload.upd, resolve, reject: rejectFn });
      });
    },
    pendingPart: (part) => pending[part],
    dropStale(part, upd) {
      dropIfOlder(part, upd);
      settle(part, upd);
    },
    freshen,
    arm,
    flush,
    onHidden() {
      if (!started || dead) return;
      freshen();
      if (dirty().length && (policy.hiddenMinMs <= 0 || now() - lastSuccessAt >= policy.hiddenMinMs)) {
        void flush("unload");
      }
    },
    retry() {
      if (failing) void flush("timer");
    },
    stop,
    dead: () => dead,
    stats: () => ({
      pending: dirty().length,
      parts: dirty(),
      flushes,
      errors,
      lastError,
      inflight: !!inflight,
      retryAt,
      tier: policy.tier,
      acked: { ...acked },
      known: { ...known },
      dead,
    }),
    dispose() {
      clearTimer();
      started = false;
    },
  };
}
