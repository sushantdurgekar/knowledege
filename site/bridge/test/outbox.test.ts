/**
 * Outbox (spec §4.5 "Flush policy", "Acknowledgement", "Error mapping"): driven through the real
 * transport against the fake sync server, with fake timers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPart, parseHubRecord, readSynced, type AnyPart } from "../src/local-progress";
import {
  MAX_BACKOFF_MS,
  MIN_BACKOFF_MS,
  SKEW_RETRY_MS,
  createOutbox,
  parsePolicy,
  DEFAULT_POLICY,
  type OutboxEvent,
  type Payload,
} from "../src/outbox";
import { createTransport, retryAtOf } from "../src/transport";
import { fakeServer, type FakeServer } from "./fake-server";

const HUB = "ai103";
const LKEY = "studyhub.ai103.v2";
const T0 = Date.parse("2026-10-12T10:00:00Z");

let server: FakeServer;
let events: OutboxEvent[];
let gzipFn: ((d: Uint8Array) => Uint8Array) | null;
let gzipLoads: number;

function writeLocal(U: Partial<Record<"main" | "mocks" | "cards", number>>, extra: Record<string, unknown> = {}): void {
  localStorage.setItem(
    LKEY,
    JSON.stringify({ S: { v: 2, done: { m1: true }, ...extra }, MOCKS: [], CARDS: {}, U: { main: 0, mocks: 0, cards: 0, ...U } }),
  );
}

function localParts(): Partial<Record<AnyPart, Payload>> {
  const rec = parseHubRecord(localStorage.getItem(LKEY));
  const out: Partial<Record<AnyPart, Payload>> = {};
  if (rec) for (const p of ["main", "mocks", "cards"] as const) out[p] = buildPart(rec, p, HUB) || undefined;
  return out;
}

function make(random = () => 0) {
  return createOutbox({
    hubId: HUB,
    parts: ["main", "mocks", "cards"],
    localParts,
    transport: createTransport(),
    storage: localStorage,
    gzip: () => gzipFn,
    loadGzip: () => {
      gzipLoads++;
    },
    random,
    onEvent: (e) => events.push(e),
  });
}

const main = (upd: number, extra: Record<string, unknown> = {}) => ({ hub: HUB, upd, S: { v: 2, ...extra } });
/** Let every queued promise chain (fetch stub → reply → acknowledgement) run. */
async function tick(): Promise<void> {
  for (let i = 0; i < 10; i++) await vi.advanceTimersByTimeAsync(0);
}
/** A promise's state without awaiting it. */
function track<T>(p: Promise<T>) {
  const state = { settled: false, error: null as any };
  p.then(
    () => (state.settled = true),
    (e) => {
      state.settled = true;
      state.error = e;
    },
  );
  return state;
}

beforeEach(() => {
  vi.useFakeTimers({ now: T0 });
  server = fakeServer();
  events = [];
  gzipFn = null;
  gzipLoads = 0;
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe("policy", () => {
  it("parses the wire policy and keeps previous values for bad fields", () => {
    const p = parsePolicy({ tier: 2, flushMs: 300000, hiddenMinMs: 60000, refreshMs: 120000, pausedUntil: null }, DEFAULT_POLICY);
    expect(p).toEqual({ tier: 2, flushMs: 300000, hiddenMinMs: 60000, refreshMs: 120000, pausedUntil: null });
    expect(parsePolicy({ tier: 9, flushMs: -1, pausedUntil: "2026-10-13T07:00:00Z" }, p)).toEqual({
      ...p,
      pausedUntil: Date.parse("2026-10-13T07:00:00Z"),
    });
    expect(parsePolicy(null, p)).toBe(p);
  });

  it("reads Retry-After / retryAfter / retryAt", () => {
    expect(retryAtOf({ retryAt: "2026-10-13T07:00:00Z" }, "5", T0)).toBe(Date.parse("2026-10-13T07:00:00Z"));
    expect(retryAtOf({ retryAfter: 30 }, null, T0)).toBe(T0 + 30000);
    expect(retryAtOf(null, "7", T0)).toBe(T0 + 7000);
    expect(retryAtOf(null, null, T0)).toBe(0);
  });
});

describe("tier timers (flushMs anchored at the first unsent change)", () => {
  it("tier 1: one request at 120 s after the FIRST change, carrying every dirty part", async () => {
    const ob = make();
    ob.start();
    writeLocal({ main: T0 });
    const w1 = track(ob.set("main", main(T0)));
    await vi.advanceTimersByTimeAsync(60_000);
    writeLocal({ main: T0 + 60_000, cards: T0 + 60_000 });
    ob.freshen(); // own LKEY write
    const w2 = track(ob.set("cards", { hub: HUB, upd: T0 + 60_000, map: {} }));
    await vi.advanceTimersByTimeAsync(59_999);
    expect(server.syncs()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    await tick();
    expect(server.syncs()).toHaveLength(1);
    const body = server.syncs()[0].body.hubs[HUB];
    expect(Object.keys(body).sort()).toEqual(["cards", "main"]);
    expect(body.main.upd).toBe(T0 + 60_000); // freshened from localStorage at flush time
    expect(w1.settled && !w1.error).toBe(true);
    expect(w2.settled && !w2.error).toBe(true);
    expect(readSynced(localStorage, HUB)).toMatchObject({ main: T0 + 60_000, cards: T0 + 60_000 });
  });

  it("tier 2 policy: 300 s window; a hidden flush only once 60 s passed since the last success", async () => {
    const ob = make();
    server.policy = { tier: 2, flushMs: 300_000, hiddenMinMs: 60_000, refreshMs: 120_000, pausedUntil: null };
    ob.setPolicy(server.policy); // the policy arrives with every progress / sync reply
    ob.start();
    writeLocal({ main: T0 });
    void ob.set("main", main(T0));
    ob.onHidden(); // never succeeded yet: flushes
    await tick();
    expect(server.syncs()).toHaveLength(1);
    writeLocal({ main: T0 + 1000 });
    ob.freshen();
    await vi.advanceTimersByTimeAsync(30_000);
    ob.onHidden(); // 30 s after the last success: held
    await tick();
    expect(server.syncs()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(30_000);
    ob.onHidden();
    await tick();
    expect(server.syncs()).toHaveLength(2);
  });

  it("re-arms when a new policy changes flushMs", async () => {
    const ob = make();
    ob.start();
    writeLocal({ main: T0 });
    ob.freshen();
    ob.arm();
    ob.setPolicy({ tier: 3, flushMs: 900_000, hiddenMinMs: 60_000, refreshMs: 300_000 });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(server.syncs()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(780_000);
    await tick();
    expect(server.syncs()).toHaveLength(1);
  });

  it("does nothing before start(), and nothing when there is nothing to send", async () => {
    const ob = make();
    writeLocal({ main: T0 });
    ob.freshen();
    await ob.flush("force");
    expect(ob.stats().pending).toBe(0);
    ob.start();
    ob.noteKnown("main", T0);
    await ob.flush("force");
    expect(server.syncs()).toHaveLength(0);
  });
});

describe("waiters and acknowledgement", () => {
  it("set() resolves only on the server's acknowledgement of a flush with upd ≥ its upd", async () => {
    const ob = make();
    ob.start();
    writeLocal({ main: T0 });
    const release = server.hold("sync");
    const w = track(ob.set("main", main(T0)));
    void ob.flush("force");
    await tick();
    expect(w.settled).toBe(false); // request in flight, not acknowledged yet
    release();
    await tick();
    expect(w.settled && !w.error).toBe(true);
    expect(ob.stats()).toMatchObject({ pending: 0, acked: { main: T0 }, known: { main: T0 } });
  });

  it("a newer set() made while a flush is in flight waits for the next flush", async () => {
    const ob = make();
    ob.start();
    writeLocal({ main: T0 });
    void ob.set("main", main(T0));
    const release = server.hold("sync");
    void ob.flush("force");
    await tick();
    writeLocal({ main: T0 + 5 });
    const w2 = track(ob.set("main", main(T0 + 5)));
    release();
    await tick();
    expect(w2.settled).toBe(false);
    expect(ob.stats().pending).toBe(1);
    await ob.flush("force");
    expect(w2.settled && !w2.error).toBe(true);
  });

  it("upd ≤ max(acked, known) resolves at once without a request", async () => {
    const ob = make();
    ob.start();
    ob.noteKnown("main", T0 + 10);
    await expect(ob.set("main", main(T0 + 10))).resolves.toBeUndefined();
    await expect(ob.set("main", main(T0))).resolves.toBeUndefined();
    expect(ob.stats().pending).toBe(0);
  });

  it("duplicate counts as acknowledged; stale resolves, records the server stamp and drops the older pending part", async () => {
    const stale: string[] = [];
    const ob = createOutbox({
      hubId: HUB,
      parts: ["main", "cards"],
      localParts,
      transport: createTransport(),
      storage: localStorage,
      gzip: () => null,
      loadGzip: () => undefined,
      onStale: (p) => stale.push(p),
    });
    ob.start();
    server.store[HUB] = { main: main(T0), cards: { hub: HUB, upd: T0 + 99, map: { c: [1, 2] } } };
    writeLocal({ main: T0, cards: T0 + 5 });
    const wm = track(ob.set("main", main(T0)));
    const wc = track(ob.set("cards", { hub: HUB, upd: T0 + 5, map: {} }));
    await ob.flush("force");
    expect(wm.settled && !wm.error).toBe(true);
    expect(wc.settled && !wc.error).toBe(true);
    expect(stale).toEqual(["cards"]);
    expect(ob.stats()).toMatchObject({ pending: 0, known: { main: T0, cards: T0 + 99 }, acked: { main: T0 } });
    expect(ob.stats().acked.cards).toBeUndefined();
    expect(server.store[HUB].cards.upd).toBe(T0 + 99); // the older write never landed
  });

  it("noteKnown (a refetch saw a newer server copy) drops an older pending part and resolves its waiters", async () => {
    const ob = make();
    ob.start();
    writeLocal({ main: T0 });
    const w = track(ob.set("main", main(T0)));
    ob.noteKnown("main", T0 + 50);
    await tick();
    expect(w.settled && !w.error).toBe(true);
    expect(ob.stats().pending).toBe(0);
  });
});

describe("freshen()", () => {
  it("own LKEY writes refresh the pending payload, so the flush carries the newest local state", async () => {
    const ob = make();
    ob.start();
    writeLocal({ main: T0 }, { n: 1 });
    void ob.set("main", main(T0, { n: 1 }));
    writeLocal({ main: T0 + 700 }, { n: 2 }); // inside the hub's 1.2 s debounce, then the tab closes
    window.dispatchEvent(new Event("noop"));
    await ob.flush("unload");
    expect(server.syncs()[0].body.hubs[HUB].main).toMatchObject({ upd: T0 + 700, S: { n: 2 } });
  });

  it("start() picks up local parts the server does not have yet (merge on first sign-in)", async () => {
    writeLocal({ main: T0, mocks: T0 + 1 });
    const ob = make();
    ob.noteKnown("main", T0); // the server already has main
    ob.start();
    expect(ob.stats().parts).toEqual(["mocks"]);
  });
});

describe("unload: dedupe, keepalive and gzip", () => {
  it("pagehide followed by visibilitychange → hidden sends one keepalive request", async () => {
    const ob = make();
    ob.start();
    writeLocal({ main: T0 });
    ob.freshen();
    void ob.flush("unload");
    ob.onHidden();
    void ob.flush("unload");
    await tick();
    expect(server.syncs()).toHaveLength(1);
    expect(server.syncs()[0]).toMatchObject({ keepalive: true, gzip: false });
  });

  it("an unload while a normal flush is in flight still goes out with keepalive", async () => {
    const ob = make();
    ob.start();
    writeLocal({ main: T0 });
    ob.freshen();
    const release = server.hold("sync");
    void ob.flush("force");
    await tick();
    writeLocal({ main: T0 + 1 });
    void ob.flush("unload");
    await tick();
    release();
    await tick();
    expect(server.syncs().map((c) => c.keepalive)).toEqual([false, true]);
    expect(server.syncs()[1].body.hubs[HUB].main.upd).toBe(T0 + 1);
  });

  it("lazy-loads fflate once the pending body passes 48 KB", () => {
    const ob = make();
    ob.start();
    writeLocal({ main: T0 }, { blob: "x".repeat(40_000) });
    ob.freshen();
    expect(gzipLoads).toBe(0);
    writeLocal({ main: T0 + 1 }, { blob: "x".repeat(50_000) });
    ob.freshen();
    writeLocal({ main: T0 + 2 }, { blob: "x".repeat(60_000) });
    ob.freshen();
    expect(gzipLoads).toBe(1);
  });

  it("> 60,000 B with fflate loaded: gzip + Content-Encoding: gzip + keepalive", async () => {
    const { gzipSync } = await import("node:zlib");
    gzipFn = (d) => new Uint8Array(gzipSync(d));
    const ob = make();
    ob.start();
    writeLocal({ main: T0 }, { blob: "ab".repeat(40_000) });
    ob.freshen();
    await ob.flush("unload");
    const c = server.syncs()[0];
    expect(c).toMatchObject({ gzip: true, keepalive: true, headers: { "content-encoding": "gzip" } });
    expect(c.wireBytes).toBeLessThan(60_000);
    expect(c.body.hubs[HUB].main.S.blob).toHaveLength(80_000);
  });

  it("> 60,000 B without fflate: a normal (non-keepalive) fetch", async () => {
    const ob = make();
    ob.start();
    writeLocal({ main: T0 }, { blob: "ab".repeat(40_000) });
    ob.freshen();
    await ob.flush("unload");
    expect(server.syncs()[0]).toMatchObject({ gzip: false, keepalive: false });
    expect(gzipLoads).toBe(1);
  });
});

describe("single request in flight", () => {
  it("timer and force flushes wait for the request in flight", async () => {
    const ob = make();
    ob.start();
    writeLocal({ main: T0 });
    ob.freshen();
    const release = server.hold("sync");
    void ob.flush("force");
    await tick();
    writeLocal({ main: T0 + 1 });
    ob.freshen();
    void ob.flush("timer");
    const forced = track(ob.flush("force"));
    await tick();
    expect(server.syncs()).toHaveLength(1);
    expect(ob.stats().inflight).toBe(true);
    release();
    await tick();
    await tick();
    expect(forced.settled).toBe(true);
    expect(server.syncs()).toHaveLength(2);
  });
});

describe("error mapping (spec §4.5)", () => {
  async function failWith(status: number, body: Record<string, unknown> | undefined, headers?: Record<string, string>) {
    const ob = make();
    ob.start();
    writeLocal({ main: T0 });
    server.fail("sync", { status, body, headers });
    const w = track(ob.set("main", main(T0)));
    await ob.flush("force");
    return { ob, w };
  }

  it("401 → revoked: the outbox stops, local data stays", async () => {
    const { ob, w } = await failWith(401, { code: "unauthenticated" });
    expect(w.error.code).toBe("revoked");
    expect(ob.dead()).toBe("revoked");
    expect(events).toContainEqual({ type: "stopped", code: "revoked" });
    await expect(ob.set("main", main(T0 + 1))).rejects.toMatchObject({ code: "revoked" });
    expect(localStorage.getItem(LKEY)).not.toBeNull();
  });

  it.each([
    [403, "csrf", "not_granted"],
    [403, "forbidden", "not_granted"],
    [400, "invalid", "invalid_argument"],
    [404, "not_found", "invalid_argument"],
    [422, "invalid", "invalid_argument"],
  ])("%i %s → %s and sync stops", async (status, code, hubCode) => {
    const { ob, w } = await failWith(status, { code });
    expect(w.error.code).toBe(hubCode);
    expect(ob.dead()).toBe(hubCode);
    await vi.advanceTimersByTimeAsync(MAX_BACKOFF_MS * 2);
    expect(server.syncs()).toHaveLength(1);
  });

  it("422 clock_skew → unavailable, pending kept, notice, retried every 10 minutes (not on unload)", async () => {
    const { ob, w } = await failWith(422, { code: "clock_skew" });
    expect(w.error.code).toBe("unavailable");
    expect(events).toContainEqual({ type: "skew" });
    expect(ob.stats()).toMatchObject({ pending: 1, hold: "skew", retryAt: T0 + SKEW_RETRY_MS, dead: null });
    void ob.flush("unload");
    await vi.advanceTimersByTimeAsync(SKEW_RETRY_MS - 1);
    expect(server.syncs()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await tick();
    expect(server.syncs()).toHaveLength(2);
    expect(ob.stats()).toMatchObject({ pending: 0, hold: "" });
  });

  it("413 → quota_exceeded: the part's pending payload is dropped, banner", async () => {
    const { ob, w } = await failWith(413, { code: "too_large" });
    expect(w.error.code).toBe("quota_exceeded");
    expect(ob.stats().pending).toBe(0);
    expect(events).toContainEqual({ type: "too_large" });
    ob.freshen(); // blocked until the hub sets it again
    expect(ob.stats().pending).toBe(0);
    writeLocal({ main: T0 + 1 });
    void ob.set("main", main(T0 + 1));
    expect(ob.stats().pending).toBe(1);
  });

  it("per-part rejected too_large → quota_exceeded for that part only", async () => {
    const ob = make();
    ob.start();
    writeLocal({ main: T0, cards: T0 });
    const real = globalThis.fetch as any;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: string, init: RequestInit) => {
        const r = await real(u, init);
        const data = await r.json();
        data.results[HUB].main = { status: "rejected", upd: 0, code: "too_large" };
        return { ...r, json: async () => data };
      }),
    );
    const wm = track(ob.set("main", main(T0)));
    const wc = track(ob.set("cards", { hub: HUB, upd: T0, map: {} }));
    await ob.flush("force");
    expect(wm.error.code).toBe("quota_exceeded");
    expect(wc.settled && !wc.error).toBe(true);
    expect(events).toContainEqual({ type: "ok", clean: false });
  });

  it("429 rate_limited → unavailable, honouring Retry-After", async () => {
    const { ob, w } = await failWith(429, { code: "rate_limited", retryAfter: 40 }, { "Retry-After": "40" });
    expect(w.error.code).toBe("unavailable");
    expect(ob.stats().retryAt).toBe(T0 + 40_000);
    await vi.advanceTimersByTimeAsync(39_999);
    expect(server.syncs()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await tick();
    expect(server.syncs()).toHaveLength(2);
  });

  it("429 sync_paused → unavailable, held until retryAt + 0–10 min jitter, banner; unload waits too", async () => {
    const until = "2026-10-13T07:00:00.000Z";
    const ob = make(() => 0.5);
    ob.start();
    writeLocal({ main: T0 });
    server.fail("sync", { status: 429, body: { code: "sync_paused", retryAt: until, retryAfter: 75600 } });
    const w = track(ob.set("main", main(T0)));
    await ob.flush("force");
    expect(w.error.code).toBe("unavailable");
    const resume = Date.parse(until) + 300_000;
    expect(ob.stats()).toMatchObject({ hold: "paused", retryAt: resume, pending: 1 });
    expect(events).toContainEqual({ type: "paused", until: Date.parse(until) });
    // While paused, set() queues and rejects at once (honest "Sync paused" pill).
    writeLocal({ main: T0 + 1 });
    await expect(ob.set("main", main(T0 + 1))).rejects.toMatchObject({ code: "unavailable" });
    void ob.flush("unload");
    ob.retry();
    await vi.advanceTimersByTimeAsync(resume - T0 - 1);
    expect(server.syncs()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await tick();
    expect(server.syncs()).toHaveLength(2);
    expect(server.store[HUB].main.upd).toBe(T0 + 1);
  });

  it("a policy that says paused holds the outbox; a later unpaused policy releases it", async () => {
    const ob = make();
    ob.setPolicy({ tier: "paused", flushMs: 900000, hiddenMinMs: 60000, refreshMs: 300000, pausedUntil: "2026-10-13T07:00:00Z" });
    expect(events).toContainEqual({ type: "paused", until: Date.parse("2026-10-13T07:00:00Z") });
    ob.start();
    writeLocal({ main: T0 });
    await expect(ob.set("main", main(T0))).rejects.toMatchObject({ code: "unavailable" });
    ob.setPolicy({ tier: 1, flushMs: 120000, hiddenMinMs: 0, refreshMs: 60000, pausedUntil: null });
    expect(events).toContainEqual({ type: "resumed" });
    await vi.advanceTimersByTimeAsync(120_000);
    await tick();
    expect(server.syncs()).toHaveLength(1);
  });

  it("503 maintenance → unavailable + banner; Retry-After honoured", async () => {
    const { ob, w } = await failWith(503, { code: "maintenance", message: "Back soon", retryAfter: 300 }, { "Retry-After": "300" });
    expect(w.error.code).toBe("unavailable");
    expect(events).toContainEqual({ type: "maintenance", message: "Back soon" });
    expect(ob.stats().retryAt).toBe(T0 + 300_000);
  });

  it("5xx and network errors → unavailable, backing off 15 s doubling to 10 min", async () => {
    const ob = make();
    ob.start();
    writeLocal({ main: T0 });
    server.fail("sync", { status: 500, body: { code: "internal" } }, 2);
    server.fail("sync", { status: 0, network: true }, 100);
    const w = track(ob.set("main", main(T0)));
    await ob.flush("force");
    expect(w.error.code).toBe("unavailable");
    const gaps: number[] = [];
    let last = Date.now();
    for (let i = 0; i < 8; i++) {
      const before = server.syncs().length;
      while (server.syncs().length === before) await vi.advanceTimersByTimeAsync(1000);
      gaps.push(Math.round((Date.now() - last) / 1000) * 1000);
      last = Date.now();
    }
    expect(gaps).toEqual([MIN_BACKOFF_MS, 30_000, 60_000, 120_000, 240_000, 480_000, MAX_BACKOFF_MS, MAX_BACKOFF_MS]);
    expect(ob.stats().lastError).toBe("network");
  });

  it("online / visible again retries only once retryAt has passed", async () => {
    const ob = make();
    ob.start();
    writeLocal({ main: T0 });
    server.fail("sync", { status: 503, body: { code: "unavailable" } });
    void ob.set("main", main(T0)).catch(() => undefined);
    await ob.flush("force");
    ob.retry();
    await tick();
    expect(server.syncs()).toHaveLength(1);
    vi.setSystemTime(T0 + MIN_BACKOFF_MS); // timers throttled in a background tab: none fired
    ob.retry();
    await tick();
    expect(server.syncs()).toHaveLength(2);
  });

  it("a background success after a failure emits a clean ok", async () => {
    const ob = make();
    ob.start();
    writeLocal({ main: T0 });
    server.fail("sync", { status: 503, body: { code: "unavailable" } });
    void ob.set("main", main(T0)).catch(() => undefined);
    await ob.flush("force");
    await vi.advanceTimersByTimeAsync(MIN_BACKOFF_MS);
    await tick();
    expect(events.at(-1)).toEqual({ type: "ok", clean: true });
    expect(ob.stats()).toMatchObject({ pending: 0, retryAt: 0, lastError: null });
  });
});
