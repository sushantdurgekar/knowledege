/**
 * DB.doc (spec §4.5): path parsing, snapshots, the cache and its refresh policy, stubs,
 * read-your-writes, handover of another tab's newer record, and set() validation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, partFromPath, snapshotOf, USER, type SyncDb } from "../src/db";
import { buildPart, parseHubRecord, readSynced, type AnyPart, type PartStamps } from "../src/local-progress";
import { createOutbox, type Outbox, type Payload } from "../src/outbox";
import { createTransport, type Reply } from "../src/transport";
import { fakeServer, type FakeServer } from "./fake-server";

const HUB = "ai103";
const LKEY = "studyhub.ai103.v2";
const T0 = Date.parse("2026-10-12T10:00:00Z");

let server: FakeServer;
let outbox: Outbox;
let sdb: SyncDb;
let tabU: PartStamps;
let loggedOut: boolean;
let replies: Reply[];

const record = (U: Partial<PartStamps>, S: Record<string, unknown> = {}) =>
  JSON.stringify({ S: { v: 2, ...S }, MOCKS: [{ pct: 80 }], CARDS: { c1: [1, 2] }, U: { main: 0, mocks: 0, cards: 0, ...U } });
const main = (upd: number, S: Record<string, unknown> = {}) => ({ hub: HUB, upd, S: { v: 2, ...S } });

function setup(localU: Partial<PartStamps> = {}): void {
  if (Object.keys(localU).length) localStorage.setItem(LKEY, record(localU, { mine: true }));
  const rec = parseHubRecord(localStorage.getItem(LKEY));
  tabU = rec ? { ...rec.U } : { main: 0, mocks: 0, cards: 0 };
  const transport = createTransport();
  outbox = createOutbox({
    hubId: HUB,
    parts: ["main", "mocks", "cards"],
    localParts() {
      const r = parseHubRecord(localStorage.getItem(LKEY));
      const out: Partial<Record<AnyPart, Payload>> = {};
      if (r) for (const p of ["main", "mocks", "cards"] as const) out[p] = buildPart(r, p, HUB) || undefined;
      return out;
    },
    transport,
    storage: localStorage,
    gzip: () => null,
    loadGzip: () => undefined,
    onAck: (p, s) => sdb.ack(p, s),
    onStale: () => sdb.invalidate(),
  });
  sdb = createDb({
    hubId: HUB,
    lkey: LKEY,
    parts: ["main", "mocks", "cards"],
    storage: localStorage,
    transport,
    outbox,
    tabU,
    now: Date.now,
    isLoggedOut: () => loggedOut,
    onReply: (r) => {
      replies.push(r);
      if (r.body && r.body.policy) outbox.setPolicy(r.body.policy);
    },
  });
}

async function tick(): Promise<void> {
  for (let i = 0; i < 10; i++) await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers({ now: T0 });
  server = fakeServer();
  loggedOut = false;
  replies = [];
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe("paths and snapshots", () => {
  it("parses the only document paths the hubs use", () => {
    expect(partFromPath("progress/main")).toBe("main");
    expect(partFromPath("data/users/me/mocks")).toBe("mocks");
    expect(partFromPath("data/users/abc_DEF-9/cards")).toBe("cards");
    for (const bad of ["progress/other", "data/users/a/b/main", "progress/main/x", "/progress/main", "", null, 42]) {
      expect(partFromPath(bad)).toBeNull();
    }
  });

  it("snapshots expose exists as a boolean property and data() returns deep copies", () => {
    const payload = { hub: HUB, upd: 5, S: { done: { m1: true } } };
    const snap = snapshotOf(payload);
    expect(snap.exists).toBe(true);
    expect(typeof snap.exists).toBe("boolean");
    const a = snap.data() as typeof payload;
    a.S.done.m1 = false;
    expect(snap.data()).toEqual(payload);
    expect(snap.data()).not.toBe(snap.data());
    expect(snapshotOf(null)).toMatchObject({ exists: false });
    expect(snapshotOf(undefined).data()).toBeUndefined();
  });

  it("use('user') is {id:'me', isOwner:false}", async () => {
    await expect(USER.id()).resolves.toBe("me");
    await expect(USER.isOwner()).resolves.toBe(false);
  });

  it("invalid paths reject invalid_argument on get and set", async () => {
    setup();
    await expect(sdb.db.doc("progress/other").get()).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(sdb.db.doc("x/main").set(main(T0))).rejects.toMatchObject({ code: "invalid_argument" });
  });
});

describe("get(): cache, refresh and stubs", () => {
  it("one GET with known=tabU serves the hub's three sequential gets", async () => {
    server.store[HUB] = { main: main(T0 - 50, { remote: true }), mocks: { hub: HUB, upd: T0 - 90, list: [] } };
    setup({ main: T0 - 50, mocks: T0 - 100 });
    const snaps = [];
    for (const p of ["main", "mocks", "cards"]) snaps.push(await sdb.db.doc(`data/users/me/${p}`).get());
    expect(server.progressGets()).toHaveLength(1);
    expect(server.progressGets()[0].query).toBe(`?known=main:${T0 - 50},mocks:${T0 - 100},cards:0`);
    // main: server not newer than known → stub → {hub, upd}; mocks: newer → payload; cards: none.
    expect(snaps[0].exists).toBe(true);
    expect(snaps[0].data()).toEqual({ hub: HUB, upd: T0 - 50 });
    expect(snaps[1].data()).toEqual({ hub: HUB, upd: T0 - 90, list: [] });
    expect(snaps[2]).toMatchObject({ exists: false });
    expect(snaps[2].data()).toBeUndefined();
    // Wherever remote.upd ≥ local U, studyhubs.synced records the local stamp (nothing local is dirty).
    expect(readSynced(localStorage, HUB)).toMatchObject({ main: T0 - 50, mocks: T0 - 100, cards: 0 });
  });

  it("refetches once the cache is older than policy.refreshMs, sending the current tabU", async () => {
    setup({ main: T0 });
    await sdb.db.doc("progress/main").get();
    await vi.advanceTimersByTimeAsync(59_000);
    await sdb.db.doc("progress/main").get();
    expect(server.progressGets()).toHaveLength(1);
    tabU.main = T0 + 5; // the hub saved again
    await vi.advanceTimersByTimeAsync(1_000);
    await sdb.db.doc("progress/main").get();
    expect(server.progressGets()).toHaveLength(2);
    expect(server.progressGets()[1].query).toBe(`?known=main:${T0 + 5},mocks:0,cards:0`);
  });

  it("a stale acknowledgement invalidates the cache: the next get() refetches and sees the newer copy", async () => {
    setup({ main: T0 });
    outbox.start();
    await sdb.db.doc("progress/main").get();
    server.store[HUB] = { main: main(T0 + 500, { other: "device" }) };
    await outbox.flush("force"); // our main(T0) is stale on the server
    const snap = await sdb.db.doc("progress/main").get();
    expect(server.progressGets()).toHaveLength(2);
    expect(snap.data()).toMatchObject({ upd: T0 + 500, S: { other: "device" } });
  });

  it("an accepted part becomes the cache (no refetch needed to read it back)", async () => {
    setup({ main: T0 });
    outbox.start();
    await sdb.db.doc("progress/main").get();
    await outbox.flush("force");
    const snap = await sdb.db.doc("progress/main").get();
    expect(server.progressGets()).toHaveLength(1);
    expect(snap.data()).toMatchObject({ upd: T0, S: { mine: true } });
  });

  it("any get() failure rejects unavailable", async () => {
    setup();
    server.fail("progress", { status: 503, body: { code: "unavailable" } });
    await expect(sdb.db.doc("progress/main").get()).rejects.toMatchObject({ code: "unavailable" });
    server.fail("progress", { status: 0, network: true });
    await expect(sdb.db.doc("progress/main").get()).rejects.toMatchObject({ code: "unavailable" });
    server.signedIn = false;
    await expect(sdb.db.doc("progress/main").get()).rejects.toMatchObject({ code: "unavailable" });
    expect(replies.map((r) => r.status)).toEqual([503, 0, 200]);
  });

  it("concurrent gets share one request", async () => {
    setup();
    await Promise.all([sdb.db.doc("progress/main").get(), sdb.db.doc("progress/cards").get()]);
    expect(server.progressGets()).toHaveLength(1);
  });
});

describe("get(): read-your-writes, stale pending, handover", () => {
  it("a newer pending payload wins over the cache", async () => {
    server.store[HUB] = { main: main(T0 - 10, { server: true }) };
    setup({ main: T0 - 20 });
    outbox.start();
    await sdb.db.doc("progress/main").get();
    void sdb.db.doc("progress/main").set(main(T0 + 1, { pending: true }));
    const snap = await sdb.db.doc("progress/main").get();
    expect(snap.data()).toMatchObject({ upd: T0 + 1, S: { pending: true } });
  });

  it("a newer server copy drops the older pending part and resolves its waiter", async () => {
    setup({ main: T0 });
    outbox.start();
    await sdb.db.doc("progress/main").get();
    let resolved = false;
    void sdb.db
      .doc("progress/main")
      .set(main(T0 + 1))
      .then(() => (resolved = true));
    expect(outbox.pendingPart("main")).toBeDefined();
    server.store[HUB] = { main: main(T0 + 900, { newer: true }) };
    sdb.invalidate();
    const snap = await sdb.db.doc("progress/main").get();
    await tick();
    expect(outbox.pendingPart("main")).toBeUndefined();
    expect(resolved).toBe(true);
    expect(snap.data()).toMatchObject({ upd: T0 + 900, S: { newer: true } });
  });

  it("hands over another tab's newer local record (U > tabU, newer than the server)", async () => {
    server.store[HUB] = { main: main(T0 - 10) };
    setup({ main: T0 - 20 });
    await sdb.db.doc("progress/main").get();
    localStorage.setItem(LKEY, record({ main: T0 + 77 }, { otherTab: true })); // tabU is NOT updated: not our write
    const snap = await sdb.db.doc("progress/main").get();
    expect(snap.data()).toMatchObject({ upd: T0 + 77, S: { otherTab: true } });
  });

  it("never hands over this tab's own record (merge on first sign-in keeps working)", async () => {
    setup({ main: T0 }); // local only, written by this tab: tabU.main === U.main
    const snap = await sdb.db.doc("progress/main").get();
    expect(snap.exists).toBe(false); // the hub sees "no remote" and flushes its own newer part
    tabU.main = T0 + 5;
    localStorage.setItem(LKEY, record({ main: T0 + 5 }));
    expect((await sdb.db.doc("progress/main").get()).exists).toBe(false);
  });

  it("does not hand over a record that is older than the server copy", async () => {
    server.store[HUB] = { main: main(T0 + 100, { server: true }) };
    setup({ main: T0 });
    localStorage.setItem(LKEY, record({ main: T0 + 50 }, { otherTab: true }));
    const snap = await sdb.db.doc("progress/main").get();
    expect(snap.data()).toMatchObject({ upd: T0 + 100, S: { server: true } });
  });
});

describe("set()", () => {
  it("rejects revoked after logout, the dead code once sync stopped, invalid_argument for bad payloads", async () => {
    setup();
    outbox.start();
    const doc = sdb.db.doc("data/users/me/main");
    await expect(doc.set({ hub: "other", upd: T0, S: {} })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(doc.set({ hub: HUB, upd: "1", S: {} })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(doc.set({ hub: HUB, upd: 1.5, S: {} })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(doc.set({ hub: HUB, upd: T0 })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(sdb.db.doc("progress/mocks").set({ hub: HUB, upd: T0, map: {} })).rejects.toMatchObject({
      code: "invalid_argument",
    });
    await expect(doc.set(null)).rejects.toMatchObject({ code: "invalid_argument" });
    outbox.stop("not_granted");
    await expect(doc.set(main(T0))).rejects.toMatchObject({ code: "not_granted" });
    loggedOut = true;
    await expect(doc.set(main(T0))).rejects.toMatchObject({ code: "revoked" });
  });

  it("queues a valid payload and resolves on acknowledgement", async () => {
    setup({ main: T0 });
    outbox.start();
    const p = sdb.db.doc("progress/main").set(main(T0, { mine: true }));
    await outbox.flush("force");
    await expect(p).resolves.toBeUndefined();
    expect(server.store[HUB].main.upd).toBe(T0);
  });
});
