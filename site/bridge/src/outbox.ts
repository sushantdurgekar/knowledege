/**
 * Outbox: batches the hub's part writes into one `POST /api/sync` per flush (build-contracts §13,
 * spec §4.5 "Flush policy" and "Acknowledgement").
 *
 *  - pending: the newest unsent payload per part. freshen() rebuilds payloads from this browser's
 *    localStorage record (on every own LKEY write and at flush time), so a change made inside the
 *    hub's 1.2 s debounce still goes out.
 *  - waiters: a hub set() resolves only when the server acknowledges a flush carrying
 *    upd ≥ its upd (accepted / duplicate / stale). While the outbox is failing (backing off,
 *    paused, clock skew) set() queues the payload and rejects "unavailable" at once, so the hub's
 *    pill honestly says "Sync paused"; a later background success rewrites the pill.
 *  - timers: flushMs anchored at the first unsent change; hidden flush per hiddenMinMs;
 *    pagehide/freeze always flush; failures back off 15 s → 10 min, honouring Retry-After /
 *    retryAt (sync_paused adds 0–10 min of jitter; clock_skew retries every 10 min).
 *  - at most one request in flight. The one exception is an unload flush (hidden, pagehide,
 *    freeze) while a normal flush is in flight: a page that is going away cannot wait, and the
 *    browser may cancel the normal fetch with it. The server's newest-wins transaction makes the
 *    overlap harmless. Unload flushes are deduplicated by body (pagehide + hidden fire together).
 *  - unload: keepalive when the body is ≤ 60,000 B. Larger bodies are gzipped with
 *    window.__shFflate (lazy-loaded once the pending body passes 48 KB) and sent with keepalive
 *    if that fits, else as a normal fetch.
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
import { codedError, warn } from "./util";

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
  /** Sync is held until `until` (the server's reset time; the retry adds jitter). */
  | { type: "paused"; until: number }
  /** A newer policy lifted the pause. */
  | { type: "resumed" }
  | { type: "skew" }
  | { type: "maintenance"; message: string }
  | { type: "too_large" }
  /** 401/403/409/invalid: sync is off for this page; `reason` is the server's code. */
  | { type: "stopped"; code: HubErrorCode; reason: string };

export interface OutboxDeps {
  hubId: string;
  /** main/mocks/cards for v2 hubs, legacy for AI-901. */
  parts: readonly AnyPart[];
  /** The parts as this browser stores them right now (rebuilt like the hub's payload()). */
  localParts(): Partial<Record<AnyPart, Payload>>;
  transport: Transport;
  /** Where `studyhubs.synced.<hubId>` is kept (writes must bypass the storage hook). */
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
  onStale?(part: AnyPart): void;
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
  /** Why flushes are held until retryAt even on unload: "paused" (sync_paused), "skew", or "". */
  hold: string;
  tier: SyncPolicy["tier"];
  acked: Record<string, number>;
  known: Record<string, number>;
  /** Set once sync is off for this page ("revoked", "not_granted", "invalid_argument"). */
  dead: HubErrorCode | null;
}

/** "timer": policy-driven (respects backoff); "force": flushNow/broadcast; "unload": hidden/pagehide/freeze. */
export type FlushKind = "timer" | "force" | "unload";

export interface Outbox {
  policy(): SyncPolicy;
  setPolicy(input: unknown): void;
  /** Sync is live (the hub holds the db, or a legacy seed arrived): freshen and arm. */
  start(): void;
  /** The hub's set(): resolves once a flush carrying upd ≥ payload.upd is acknowledged. */
  set(part: AnyPart, payload: Payload): Promise<void>;
  pendingPart(part: AnyPart): Payload | undefined;
  /** The server holds `part` at `upd`: remember it, drop an older pending payload, resolve its waiters. */
  noteKnown(part: AnyPart, upd: number): void;
  /** Rebuild pending payloads from local storage (own LKEY write, flush time). */
  freshen(): void;
  arm(): void;
  flush(kind: FlushKind): Promise<void>;
  /** visibilitychange → hidden: flush per policy.hiddenMinMs. */
  onHidden(): void;
  /** online, or visible again: retry once a failure's retryAt has passed. */
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
  /** Parts the server refused for good (too large / invalid): only the hub's own next set() re-queues them. */
  const blocked: Partial<Record<AnyPart, boolean>> = {};
  let waiters: Waiter[] = [];
  let policy: SyncPolicy = { ...DEFAULT_POLICY };
  let started = false;
  let dead: HubErrorCode | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let firstDirtyAt = 0;
  let retryAt = 0;
  let hold: "" | "paused" | "skew" = "";
  let failing = false;
  let backoff = 0;
  let lastSuccessAt = 0;
  let inflight: Promise<void> | null = null;
  /** Body of the last unload send, for deduplication (cleared when that send fails). */
  let unloadBody = "";
  let gzipAsked = false;
  let flushes = 0;
  let errors = 0;
  let lastError: string | null = null;

  const emit = (e: OutboxEvent): void => {
    try {
      if (d.onEvent) d.onEvent(e);
    } catch (x) {
      warn("sync event handler failed", x);
    }
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

  /** The server holds `p` at `upd` or newer: an older pending payload is moot, its waiters are done. */
  function drop(p: AnyPart, upd: number): void {
    if (pending[p] && pending[p]!.upd <= upd) delete pending[p];
    settle(p, upd);
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
    const local = d.localParts();
    let added = false;
    for (const p of d.parts) {
      const loc = local[p];
      if (!loc || blocked[p]) continue;
      if (loc.upd > have(p)) {
        put(p, loc);
        added = true;
      } else if (loc.upd <= Math.max(known[p] || 0, acked[p] || 0)) {
        markSynced(d.storage, d.hubId, p, loc.upd); // e.g. the hub just adopted the server's copy
      }
    }
    if (added && !gzipAsked && JSON.stringify(pending).length > GZIP_PRELOAD_BYTES) preloadGzip();
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

  function rearm(): void {
    clearTimer();
    arm();
  }

  /** Hold every flush until `until` (+ 0–10 min jitter); waiters learn "unavailable" now. */
  function pause(until: number): void {
    failing = true;
    hold = "paused";
    retryAt = until + Math.floor(random() * PAUSE_JITTER_MS);
    settle(null, 0, "unavailable");
    emit({ type: "paused", until });
    rearm();
  }

  function recover(): void {
    failing = false;
    hold = "";
    retryAt = backoff = 0;
  }

  function setPolicy(input: unknown): void {
    const prev = policy.flushMs;
    policy = parsePolicy(input, policy);
    const until = policy.tier === "paused" ? policy.pausedUntil || 0 : 0;
    if (until > now()) {
      if (hold !== "paused" || retryAt < until) pause(until);
    } else if (hold === "paused") {
      recover();
      emit({ type: "resumed" });
      rearm();
    } else if (policy.flushMs !== prev && timer !== undefined && !failing) {
      rearm();
    }
  }

  /** The server refused this part for good (too large / invalid): drop it until the hub sets it again. */
  function reject(p: AnyPart, s: Payload, code: HubErrorCode): void {
    if (pending[p] && pending[p]!.upd <= s.upd) delete pending[p];
    blocked[p] = true;
    settle(p, 0, code);
    if (code === "quota_exceeded") emit({ type: "too_large" });
  }

  function onReply(r: Reply, sent: Partial<Record<AnyPart, Payload>>, body: string): void {
    const t = now();
    const res = r.status === 200 && r.body && r.body.results && r.body.results[d.hubId];
    if (!res || typeof res !== "object") return fail(r, sent, body, t);
    let clean = true;
    for (const p of Object.keys(sent) as AnyPart[]) {
      const s = sent[p]!;
      const x = res[p] || {};
      const u = Math.max(typeof x.upd === "number" ? x.upd : 0, s.upd);
      if (x.status === "accepted" || x.status === "duplicate" || x.status === "stale") {
        // stale: the server keeps a newer copy (u); the next get() refetches and the hub adopts it.
        known[p] = Math.max(known[p] || 0, u);
        markSynced(d.storage, d.hubId, p, s.upd);
        if (x.status === "stale") {
          if (d.onStale) d.onStale(p);
        } else {
          acked[p] = Math.max(acked[p] || 0, u);
          if (d.onAck) d.onAck(p, s);
        }
        drop(p, u);
      } else if (x.status === "rejected") {
        clean = false;
        reject(p, s, x.code === "too_large" ? "quota_exceeded" : "invalid_argument");
      } else {
        clean = false; // no verdict for this part: it stays pending for the next flush
      }
    }
    recover();
    lastSuccessAt = t;
    lastError = null;
    emit({ type: "ok", clean });
    if (r.body!.policy) setPolicy(r.body!.policy);
  }

  function fail(r: Reply, sent: Partial<Record<AnyPart, Payload>>, body: string, t: number): void {
    const code = r.body && typeof r.body.code === "string" ? r.body.code : "";
    const hubCode = codeForResponse(r.status, code);
    errors++;
    lastError = code || (r.status ? String(r.status) : "network");
    if (body === unloadBody) unloadBody = "";
    if (hubCode === "quota_exceeded") {
      for (const p of Object.keys(sent) as AnyPart[]) reject(p, sent[p]!, hubCode);
      return;
    }
    if (hubCode !== "unavailable") {
      stop(hubCode);
      emit({ type: "stopped", code: hubCode, reason: code });
      return;
    }
    backoff = backoff ? Math.min(backoff * 2, MAX_BACKOFF_MS) : MIN_BACKOFF_MS;
    if (r.status === 429 && code === "sync_paused") return pause(r.retryAt || t + backoff);
    failing = true;
    if (code === "clock_skew") {
      hold = "skew";
      retryAt = t + SKEW_RETRY_MS;
      emit({ type: "skew" });
    } else {
      retryAt = r.retryAt > t ? r.retryAt : t + backoff;
      if (code === "maintenance") {
        emit({ type: "maintenance", message: typeof r.body!.message === "string" ? r.body!.message : "" });
      }
    }
    settle(null, 0, "unavailable");
  }

  function flush(kind: FlushKind): Promise<void> {
    if (!started || dead) return DONE;
    freshen();
    if (!dirty().length) return DONE;
    if (kind !== "force" && now() < retryAt && (hold || kind !== "unload")) {
      arm();
      return DONE;
    }
    if (inflight && kind !== "unload") return kind === "force" ? inflight.then(() => flush("force")) : inflight;
    const sent: Partial<Record<AnyPart, Payload>> = { ...pending };
    const body = JSON.stringify({ hubs: { [d.hubId]: sent } });
    if (kind === "unload") {
      if (body === unloadBody) return inflight || DONE;
      unloadBody = body;
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
      .request("POST", "/sync", { body: wire, keepalive: kind === "unload" && wireSize <= KEEPALIVE_MAX_BYTES })
      .then((r) => onReply(r, sent, body))
      .then(() => {
        if (inflight === req) inflight = null;
        arm();
      });
    inflight = req;
    return req;
  }

  function stop(code: HubErrorCode): void {
    dead = code;
    clearTimer();
    settle(null, 0, code);
  }

  return {
    policy: () => policy,
    setPolicy,
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
      if (failing) return Promise.reject(codedError("unavailable", "sync: unavailable"));
      return new Promise<void>((resolve, rejectFn) => {
        waiters.push({ part, upd: payload.upd, resolve, reject: rejectFn });
      });
    },
    pendingPart: (part) => pending[part],
    noteKnown(part, upd) {
      if (upd > (known[part] || 0)) known[part] = upd;
      drop(part, upd);
    },
    freshen,
    arm,
    flush,
    onHidden() {
      if (now() - lastSuccessAt >= policy.hiddenMinMs) void flush("unload");
    },
    retry() {
      if (failing && now() >= retryAt) void flush("timer");
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
      hold,
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
