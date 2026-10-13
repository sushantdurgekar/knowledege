/**
 * Signed-in mode end to end (spec §4.5 "Boot" and "Capability map"; build-contracts §13): the
 * bridge booted as injected, the fake sync server, and a port of the hub engine's sync code.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiShim } from "../src/ai";
import { readSynced } from "../src/local-progress";
import { createFakeHub, type FakeHub } from "./fake-hub";
import { fakeServer, type FakeServer } from "./fake-server";
import {
  HUB_DATA,
  boot,
  captureShadowRoots,
  otherTabWrite,
  pretendLoading,
  setVisibility,
  signIn,
  useCleanBridge,
} from "./helpers";

useCleanBridge();

const HUB = "ai103";
const LKEY = "studyhub.ai103.v2";
const T0 = Date.parse("2026-10-12T10:00:00Z");
let server: FakeServer;

const record = (U: Record<string, number>, S: Record<string, unknown> = {}) =>
  JSON.stringify({ S: { v: 2, done: {}, ...S }, MOCKS: [], CARDS: {}, U: { main: 0, mocks: 0, cards: 0, ...U } });

async function tick(): Promise<void> {
  for (let i = 0; i < 12; i++) await vi.advanceTimersByTimeAsync(0);
}

/** Bridge first (as injected before </head>), then the hub's engine, which calls use() while parsing. */
async function openHub(data: Record<string, string> = { ...HUB_DATA }): Promise<{ hub: FakeHub; handle: ReturnType<typeof boot> }> {
  const handle = boot(data);
  const hub = createFakeHub(HUB);
  void hub.initSync();
  await tick();
  return { hub, handle };
}

beforeEach(() => {
  vi.useFakeTimers({ now: T0 });
  server = fakeServer();
});

describe("boot", () => {
  it("anonymous: no hint → no request, db/user null", async () => {
    const { hub, handle } = await openHub();
    expect(server.calls).toEqual([]);
    expect(hub.pill().text).toBe("Saved in this browser");
    expect(handle.api.stats()).toMatchObject({ mode: "anonymous", network: 0, sync: null });
  });

  it("signed in: prefetch GET with known=tabU, X-StudyHubs: 1 and same-origin credentials", async () => {
    localStorage.setItem(LKEY, record({ main: T0 - 5000, cards: T0 - 9000 }));
    signIn();
    const handle = boot();
    expect(server.calls).toHaveLength(1); // started synchronously at boot, before the hub runs
    const c = server.calls[0];
    expect(c.method).toBe("GET");
    expect(c.path).toBe("/api/progress/ai103");
    expect(c.query).toBe(`?known=main:${T0 - 5000},mocks:0,cards:${T0 - 9000}`);
    expect(c.headers["x-studyhubs"]).toBe("1");
    expect(c.credentials).toBe("same-origin");
    expect(handle.api.stats().sync).toMatchObject({ tabU: { main: T0 - 5000, mocks: 0, cards: T0 - 9000 } });
  });

  it("legacy and static hubs start no prefetch", () => {
    signIn();
    boot({ hubId: "ai901", slug: "ai-901", engine: "legacy", legacyKeys: "ai901hub.v1" });
    expect(server.calls).toEqual([]);
  });

  it("owner mismatch: zero requests, db/user null, the mismatch notice links to /account", async () => {
    localStorage.setItem("studyhubs.owner", "pub_OTHER");
    localStorage.setItem(LKEY, record({ main: T0 - 1 }));
    signIn("pub_A");
    const shadows = captureShadowRoots();
    const { hub, handle } = await openHub();
    expect(server.calls).toEqual([]);
    expect(hub.SYNC.db).toBeNull();
    expect(hub.pill().text).toBe("Saved in this browser");
    expect(handle.api.stats()).toMatchObject({ mode: "mismatch", chrome: { notices: ["mismatch"] } });
    const note = shadows.rootOf("studyhubs-chrome")!.querySelector('[data-id="mismatch"]')!;
    expect(note.textContent).toContain("This browser has progress from another account");
    expect(note.querySelector("a")!.getAttribute("href")).toBe("/account");
  });
});

describe("capability map", () => {
  it("signed in: DB + {id:'me'}; first sign-in claims the owner tag and merges local progress", async () => {
    localStorage.setItem(LKEY, record({ main: T0 - 5000 }, { done: { m1: true } }));
    signIn();
    const { hub, handle } = await openHub();
    expect(hub.SYNC.base).toBe("data/users/me");
    expect(hub.pill()).toEqual({ text: "Synced to your account", cls: "pill ok" });
    expect(localStorage.getItem("studyhubs.owner")).toBe("pub_A");
    expect(handle.api.stats()).toMatchObject({ mode: "signed-in", sync: { ready: true, active: true } });
    // The local part goes up in ONE request at the end of the tier-1 window.
    await vi.advanceTimersByTimeAsync(120_000);
    await tick();
    expect(server.syncs()).toHaveLength(1);
    expect(server.store[HUB].main).toMatchObject({ hub: HUB, upd: T0 - 5000, S: { done: { m1: true } } });
    expect(readSynced(localStorage, HUB).main).toBe(T0 - 5000);
  });

  it("remote newer than local is adopted and nothing is written back (S4)", async () => {
    localStorage.setItem(LKEY, record({ main: T0 - 5000 }, { done: { m1: true } }));
    server.store[HUB] = { main: { hub: HUB, upd: T0 - 100, S: { v: 2, done: { m1: true, m2: true, m3: true } } } };
    signIn();
    const { hub } = await openHub();
    expect(hub.U.main).toBe(T0 - 100);
    expect(hub.S.done).toEqual({ m1: true, m2: true, m3: true });
    expect(JSON.parse(localStorage.getItem(LKEY)!).U.main).toBe(T0 - 100);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(server.syncs()).toHaveLength(0);
    expect(readSynced(localStorage, HUB).main).toBe(T0 - 100);
  });

  it("a stub part (server not newer than known) leaves the hub alone", async () => {
    localStorage.setItem(LKEY, record({ main: T0 - 100 }));
    server.store[HUB] = { main: { hub: HUB, upd: T0 - 100, S: { v: 2 } } };
    signIn();
    const { hub } = await openHub();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(server.syncs()).toHaveLength(0);
    expect(hub.pill().text).toBe("Synced to your account");
  });

  it("prefetch timeout (5 s) → null: the hub stays local", async () => {
    signIn();
    server.hold("progress");
    const { hub, handle } = await openHub();
    expect(hub.pill().text).toBe("Connecting…");
    await vi.advanceTimersByTimeAsync(4_999);
    expect(hub.SYNC.db).toBeNull();
    expect(hub.pill().text).toBe("Connecting…");
    await vi.advanceTimersByTimeAsync(1);
    await tick();
    expect(hub.pill().text).toBe("Saved in this browser");
    expect(handle.api.stats().sync).toMatchObject({ active: false });
  });

  it("{signedIn:false} → anonymous: null, sh_hint cleared, the menu offers Sign in again", async () => {
    server.signedIn = false;
    signIn();
    const shadows = captureShadowRoots();
    const { hub, handle } = await openHub();
    expect(hub.SYNC.db).toBeNull();
    expect(document.cookie).not.toContain("sh_hint");
    expect(handle.api.stats().mode).toBe("anonymous");
    const items = Array.from(shadows.rootOf("studyhubs-chrome")!.querySelectorAll("nav .it")).map((n) => n.textContent);
    expect(items).toEqual(["← All hubs", "Sign in", "Download"]);
  });

  it("503 maintenance → null and a maintenance notice", async () => {
    server.fail("progress", { status: 503, body: { code: "maintenance", message: "Moving house", retryAfter: 300 } });
    signIn();
    const { hub, handle } = await openHub();
    expect(hub.SYNC.db).toBeNull();
    expect(handle.api.stats().chrome.notices).toEqual(["maintenance"]);
  });

  it("5xx / network at boot → the DB anyway: 'Sync paused' until the server answers", async () => {
    localStorage.setItem(LKEY, record({ main: T0 - 5000 }));
    server.fail("progress", { status: 0, network: true }, 2);
    signIn();
    const { hub } = await openHub();
    expect(hub.SYNC.db).not.toBeNull();
    expect(hub.pill()).toEqual({ text: "Sync paused, saved in this browser", cls: "pill mid" });
    // Back online: the next visibility pull works, the queued part goes up, the pill recovers.
    await vi.advanceTimersByTimeAsync(1000);
    setVisibility("visible");
    await tick();
    await vi.advanceTimersByTimeAsync(120_000);
    await tick();
    expect(server.store[HUB].main.upd).toBe(T0 - 5000);
    expect(hub.pill().cls).toBe("pill ok");
  });

  it("refuses the DB when window.HUB.id is not the injected hub id", async () => {
    signIn();
    const handle = boot();
    (window as any).HUB = { id: "someone-else" };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(window.claude!.use("db")).resolves.toBeNull();
    await expect(window.claude!.use("user")).resolves.toBeNull();
    expect(warn).toHaveBeenCalled();
    expect(handle.api.stats().sync).toMatchObject({ active: false });
  });

  it("server publicId differs from this browser's owner → mismatch after all", async () => {
    localStorage.setItem("studyhubs.owner", "pub_A");
    server.publicId = "pub_Z";
    signIn("pub_A");
    const { hub, handle } = await openHub();
    expect(hub.SYNC.db).toBeNull();
    expect(handle.api.stats().mode).toBe("mismatch");
    expect(localStorage.getItem("studyhubs.owner")).toBe("pub_A");
  });

  it("sample is still the AI shim, at once; unknown names reject not_declared", async () => {
    signIn();
    boot();
    let ai: unknown;
    void window.claude!.use("sample").then((x) => (ai = x));
    await Promise.resolve();
    expect(typeof ai).toBe("function");
    expect(typeof (ai as AiShim).json).toBe("function");
    await expect(window.claude!.use("storage")).rejects.toMatchObject({ code: "not_declared" });
  });

  it("static hubs: db/user null and no request even when signed in", async () => {
    signIn();
    boot({ hubId: "x1", slug: "x-1", engine: "static" });
    await expect(window.claude!.use("db")).resolves.toBeNull();
    await expect(window.claude!.use("user")).resolves.toBeNull();
    expect(server.calls).toEqual([]);
  });
});

describe("learner sessions", () => {
  it("10 answers at learner pace → one request at tier 1; every set() resolves on the ack (S8)", async () => {
    signIn();
    const { hub } = await openHub();
    for (let i = 0; i < 10; i++) {
      hub.touch("main", () => (hub.S.quiz[`q${i}`] = true));
      await vi.advanceTimersByTimeAsync(1500);
    }
    expect(server.syncs()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(120_000);
    await tick();
    expect(server.syncs()).toHaveLength(1);
    expect(Object.keys(server.store[HUB].main.S.quiz)).toHaveLength(10);
    expect(hub.pill().text).toBe("Synced to your account");
  });

  it("closing the tab right after an answer sends the newest state with keepalive", async () => {
    signIn();
    const { hub } = await openHub();
    hub.touch("main", () => (hub.S.quiz.last = true)); // the hub's own 1.2 s debounce has not fired
    window.dispatchEvent(new Event("pagehide"));
    setVisibility("hidden");
    await tick();
    expect(server.syncs()).toHaveLength(1);
    expect(server.syncs()[0].keepalive).toBe(true);
    expect(server.store[HUB].main.S.quiz.last).toBe(true);
  });

  it("freeze flushes too", async () => {
    signIn();
    const { hub } = await openHub();
    hub.touch("cards", () => (hub.CARDS.c1 = [2, 3]));
    document.dispatchEvent(new Event("freeze"));
    await tick();
    expect(server.store[HUB].cards.map).toEqual({ c1: [2, 3] });
  });

  it("another tab's newer progress is handed over on the next visibility pull", async () => {
    signIn();
    const { hub } = await openHub();
    otherTabWrite(LKEY, record({ main: T0 + 9000 }, { done: { fromTab2: true } }));
    await vi.advanceTimersByTimeAsync(61_000);
    setVisibility("visible");
    await tick();
    expect(hub.S.done).toEqual({ fromTab2: true });
    expect(hub.U.main).toBe(T0 + 9000);
  });

  it("after a failed flush the hub shows 'Sync paused'; a background success rewrites the pill", async () => {
    signIn();
    const { hub } = await openHub();
    server.fail("sync", { status: 503, body: { code: "unavailable" }, headers: { "Retry-After": "20" } });
    hub.touch("main", () => (hub.S.done.m9 = true));
    await vi.advanceTimersByTimeAsync(121_200);
    await tick();
    expect(hub.pill()).toEqual({ text: "Sync paused, saved in this browser", cls: "pill mid" });
    await vi.advanceTimersByTimeAsync(20_000);
    await tick();
    expect(server.store[HUB].main.S.done.m9).toBe(true);
    expect(hub.pill()).toEqual({ text: "Synced to your account", cls: "pill ok" });
  });

  it("401 mid-session → revoked: the hub drops to local, 'Session ended' notice, data kept", async () => {
    signIn();
    const { hub, handle } = await openHub();
    server.fail("sync", { status: 401, body: { code: "unauthenticated" } });
    hub.touch("main", () => (hub.S.done.m1 = true));
    await vi.advanceTimersByTimeAsync(121_200);
    await tick();
    expect(hub.SYNC.db).toBeNull();
    expect(hub.pill().text).toBe("Saved in this browser");
    expect(handle.api.stats().chrome.notices).toContain("session");
    expect(JSON.parse(localStorage.getItem(LKEY)!).S.done.m1).toBe(true);
  });

  it("another account signs in from another tab: nothing more is sent, the page asks for a reload", async () => {
    signIn("pub_A");
    const { hub, handle } = await openHub();
    hub.touch("main", () => (hub.S.done.mineA = true)); // A's change, not synced yet (tier-1 window)
    await vi.advanceTimersByTimeAsync(1500);
    // The other tab's sign-in replaced both cookies; its dialog is still open (no broadcast yet).
    signIn("pub_B");
    server.publicId = "pub_B";
    await handle.api.flushNow();
    window.dispatchEvent(new Event("pagehide"));
    await vi.advanceTimersByTimeAsync(130_000);
    await tick();
    expect(server.syncs(), "A's progress never goes out with B's cookie").toHaveLength(0);
    expect(server.store[HUB]).toBeUndefined();
    expect(handle.api.stats()).toMatchObject({ outbox: { dead: "revoked" }, storage: { loggedOut: true } });
    expect(handle.api.stats().chrome.notices).toContain("auth");
    expect(hub.SYNC.db).toBeNull();
    hub.touch("main", () => (hub.S.done.later = true));
    expect(JSON.parse(localStorage.getItem(LKEY)!).S.done.later, "the logout guard keeps A's memory out of storage").toBeUndefined();
  });

  it("every request after the prefetch names the page's account; the server's 409 stops sync", async () => {
    signIn("pub_A");
    const { hub, handle } = await openHub();
    expect(server.progressGets()[0].headers["x-studyhubs-account"], "the prefetch learns the account").toBeUndefined();
    hub.touch("main", () => (hub.S.done.m1 = true));
    await handle.api.flushNow();
    expect(server.syncs()[0].headers["x-studyhubs-account"]).toBe("pub_A");
    // The session became B's while sh_hint did not change (a race the cookie check cannot see).
    server.publicId = "pub_B";
    await vi.advanceTimersByTimeAsync(1500);
    hub.touch("main", () => (hub.S.done.m2 = true));
    await handle.api.flushNow();
    await tick();
    expect(server.syncs()).toHaveLength(2);
    expect(server.store[HUB].main.S.done.m2, "refused: nothing of A lands under B").toBeUndefined();
    expect(handle.api.stats()).toMatchObject({ outbox: { dead: "revoked" }, storage: { loggedOut: true } });
    expect(handle.api.stats().chrome.notices).toContain("auth");
    expect(handle.api.stats().chrome.notices).not.toContain("session");
  });

  it("413 → the hub's 'Account storage is full' toast and a too-large notice", async () => {
    signIn();
    const { hub, handle } = await openHub();
    server.fail("sync", { status: 413, body: { code: "too_large" } });
    hub.touch("main");
    await vi.advanceTimersByTimeAsync(121_200);
    await tick();
    expect(hub.toasts).toEqual(["Account storage is full; progress stays in this browser."]);
    expect(handle.api.stats().chrome.notices).toContain("too-large");
  });

  it("clock ahead (422 clock_skew) → notice, nothing stored (S14)", async () => {
    signIn();
    const { hub, handle } = await openHub();
    server.fail("sync", { status: 422, body: { code: "clock_skew" } }, 5);
    hub.touch("main");
    await vi.advanceTimersByTimeAsync(121_200);
    await tick();
    expect(handle.api.stats().chrome.notices).toContain("clock");
    expect(hub.pill().cls).toBe("pill mid");
    expect(server.store[HUB]).toBeUndefined();
  });

  it("quota paused at boot → 'Sync paused' with the reset time, no toast; flushNow drains after the reset (S16)", async () => {
    server.policy = { tier: "paused", flushMs: 900000, hiddenMinMs: 60000, refreshMs: 300000, pausedUntil: "2026-10-13T07:00:00Z" };
    signIn();
    const shadows = captureShadowRoots();
    const { hub, handle } = await openHub();
    hub.touch("main", () => (hub.S.done.m2 = true));
    await vi.advanceTimersByTimeAsync(1300);
    await tick();
    expect(hub.pill().text).toBe("Sync paused, saved in this browser");
    expect(hub.toasts).toEqual([]);
    expect(handle.api.stats().chrome.notices).toContain("paused");
    const note = shadows.rootOf("studyhubs-chrome")!.querySelector('[data-id="paused"]')!.textContent!;
    expect(note).toMatch(/Sync resumes at .*\d/);
    window.dispatchEvent(new Event("pagehide")); // held: the server would refuse it
    await tick();
    expect(server.syncs()).toHaveLength(0);
    server.policy = { tier: 1, flushMs: 120000, hiddenMinMs: 0, refreshMs: 60000, pausedUntil: null };
    await handle.api.flushNow();
    expect(server.store[HUB].main.S.done.m2).toBe(true);
    expect(handle.api.stats().chrome.notices).not.toContain("paused");
  });
});

describe("chrome when signed in", () => {
  it("shows the cached initial with an Account / Sign out menu", async () => {
    localStorage.setItem("studyhubs.profile", JSON.stringify({ id: "pub_A", initial: "S" }));
    signIn();
    const shadows = captureShadowRoots();
    const finishParsing = pretendLoading();
    boot();
    finishParsing();
    await tick();
    const root = shadows.rootOf("studyhubs-chrome")!;
    const btn = root.querySelector<HTMLButtonElement>("button.av")!;
    expect(btn.textContent).toBe("S");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    const menu = root.querySelector<HTMLElement>(".menu")!;
    expect(menu.hidden).toBe(true);
    btn.click();
    expect(menu.hidden).toBe(false);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(Array.from(menu.querySelectorAll("a")).map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Account", "/account"],
      ["Sign out", "/signout"],
    ]);
    menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }));
    expect(menu.hidden).toBe(true);
    btn.click();
    document.body.click(); // outside
    expect(menu.hidden).toBe(true);
    expect(server.calls.filter((c) => c.path === "/api/me")).toHaveLength(0);
    expect(root.querySelector('a[href^="/signin"]')).toBeNull();
  });

  it("without a cached profile: one GET /api/me after the prefetch, then the initial", async () => {
    signIn();
    const shadows = captureShadowRoots();
    await openHub();
    expect(server.calls.map((c) => c.path)).toEqual(["/api/progress/ai103", "/api/me"]);
    expect(shadows.rootOf("studyhubs-chrome")!.querySelector(".av")!.textContent).toBe("S");
    expect(JSON.parse(localStorage.getItem("studyhubs.profile")!)).toEqual({ id: "pub_A", initial: "S" });
  });

  it("no anonymous nudge for signed-in visitors", async () => {
    signIn();
    const { hub, handle } = await openHub();
    hub.touch("main");
    expect(handle.api.stats().chrome.notices).not.toContain("nudge");
  });

  it("storage-full notice links to /account#storage when signed in", async () => {
    const realSet = Storage.prototype.setItem;
    let full = false;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k: string, v: string) {
      if (full) throw new DOMException("full", "QuotaExceededError");
      realSet.call(this, k, v);
    });
    signIn();
    const shadows = captureShadowRoots();
    await openHub();
    full = true;
    expect(() => localStorage.setItem(LKEY, record({ main: T0 }))).toThrow(DOMException);
    full = false;
    const note = shadows.rootOf("studyhubs-chrome")!.querySelector('[data-id="storage-full"] a')!;
    expect(note.getAttribute("href")).toBe("/account#storage");
  });
});
