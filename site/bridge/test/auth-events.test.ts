/**
 * Auth events (spec §4.5 "Auth events", build-contracts §13): BroadcastChannel "studyhubs"
 * flush / auth-changed / logout, the logout guard, account switches and bfcache restores.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHANNEL, readAuthState } from "../src/auth-events";
import { createFakeHub, type FakeHub } from "./fake-hub";
import { fakeServer, type FakeServer } from "./fake-server";
import { boot, reloads, setVisibility, signIn, useCleanBridge } from "./helpers";

useCleanBridge();

const HUB = "ai103";
const LKEY = "studyhub.ai103.v2";
const T0 = Date.parse("2026-10-12T10:00:00Z");
let server: FakeServer;

/** In-process BroadcastChannel: post() delivers to every open channel of that name. */
class FakeChannel {
  static open: FakeChannel[] = [];
  private listeners: Array<(e: MessageEvent) => void> = [];
  constructor(public name: string) {
    FakeChannel.open.push(this);
  }
  addEventListener(_type: string, fn: (e: MessageEvent) => void): void {
    this.listeners.push(fn);
  }
  postMessage(): void {}
  close(): void {
    FakeChannel.open = FakeChannel.open.filter((c) => c !== this);
  }
  static post(data: unknown): void {
    for (const c of FakeChannel.open.slice()) for (const fn of c.listeners) fn({ data } as MessageEvent);
  }
}

async function tick(): Promise<void> {
  for (let i = 0; i < 12; i++) await vi.advanceTimersByTimeAsync(0);
}

async function openSignedIn(): Promise<FakeHub> {
  signIn();
  boot();
  const hub = createFakeHub(HUB);
  void hub.initSync();
  await tick();
  return hub;
}

beforeEach(() => {
  vi.useFakeTimers({ now: T0 });
  vi.stubGlobal("BroadcastChannel", FakeChannel);
  server = fakeServer();
});

afterEach(() => {
  FakeChannel.open = [];
});

describe("auth state", () => {
  it("mismatch = hint and owner both set and different", () => {
    localStorage.setItem("studyhubs.owner", "pub_B");
    expect(readAuthState("pub_A", localStorage)).toEqual({ hint: "pub_A", owner: "pub_B", mismatch: true });
    expect(readAuthState("pub_B", localStorage).mismatch).toBe(false);
    expect(readAuthState(null, localStorage).mismatch).toBe(false);
    localStorage.removeItem("studyhubs.owner");
    expect(readAuthState("pub_A", localStorage).mismatch).toBe(false);
  });

  it("listens on the 'studyhubs' channel in every mode, without any request", () => {
    boot();
    expect(FakeChannel.open.map((c) => c.name)).toEqual([CHANNEL]);
    expect(server.calls).toEqual([]);
  });
});

describe("flush", () => {
  it("{type:'flush'} pushes pending progress at once", async () => {
    const hub = await openSignedIn();
    hub.touch("main", () => (hub.S.done.m1 = true));
    FakeChannel.post({ type: "flush" });
    await tick();
    expect(server.syncs()).toHaveLength(1);
    expect(server.store[HUB].main.S.done.m1).toBe(true);
  });

  it("is harmless on an anonymous page", async () => {
    boot();
    FakeChannel.post({ type: "flush" });
    await tick();
    expect(server.calls).toEqual([]);
  });
});

describe("logout", () => {
  it("sets the guard, wipes progress (keeps codeLang and ui.*), stops sync and reloads", async () => {
    const hub = await openSignedIn();
    localStorage.setItem("studyhub.codeLang", "python");
    localStorage.setItem("studyhubs.ui.nudge.ai103", "1");
    localStorage.setItem("studyhub.ai103.mockrun", "{}");
    hub.touch("main", () => (hub.S.done.m1 = true));
    FakeChannel.post({ type: "logout" });
    expect(reloads.count).toBe(1);
    expect(Object.keys(localStorage).sort()).toEqual(["studyhub.codeLang", "studyhubs.ui.nudge.ai103"]);
    // A closing tab must not re-save the previous user's progress, and nothing more is sent.
    hub.saveLocal();
    expect(localStorage.getItem(LKEY)).toBeNull();
    await expect(hub.SYNC.db.doc("data/users/me/main").set({ hub: HUB, upd: Date.now(), S: {} })).rejects.toMatchObject({
      code: "revoked",
    });
    window.dispatchEvent(new Event("pagehide"));
    await vi.advanceTimersByTimeAsync(600_000);
    expect(server.syncs()).toHaveLength(0);
    expect(window.__studyhubsBridge!.stats().storage).toMatchObject({ loggedOut: true });
  });
});

describe("auth-changed", () => {
  it("a visible anonymous tab shows 'Signed in — reload to sync' and reloads on the next visibility change", async () => {
    boot();
    signIn("pub_A");
    localStorage.setItem("studyhubs.owner", "pub_A");
    FakeChannel.post({ type: "auth-changed" });
    expect(reloads.count).toBe(0);
    expect(window.__studyhubsBridge!.stats().chrome.notices).toEqual(["auth"]);
    expect(window.__studyhubsBridge!.stats().storage.loggedOut).toBe(false); // same browser data: writes keep landing
    setVisibility("hidden");
    expect(reloads.count).toBe(1);
  });

  it("…but not while a mock exam is running", () => {
    boot();
    signIn("pub_A");
    localStorage.setItem("studyhub.ai103.mockrun", "{}");
    FakeChannel.post({ type: "auth-changed" });
    setVisibility("hidden");
    setVisibility("visible");
    expect(reloads.count).toBe(0);
    localStorage.removeItem("studyhub.ai103.mockrun");
    setVisibility("hidden");
    expect(reloads.count).toBe(1);
  });

  it("a hidden tab reloads at once", () => {
    boot();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    signIn("pub_A");
    FakeChannel.post({ type: "auth-changed" });
    expect(reloads.count).toBe(1);
  });

  it("another account signed in: the logout guard goes on and sync stops before the reload", async () => {
    const hub = await openSignedIn(); // pub_A, owner claimed
    hub.touch("main", () => (hub.S.done.a = true));
    signIn("pub_B");
    localStorage.setItem("studyhubs.owner", "pub_B");
    localStorage.removeItem(LKEY); // the shell wiped A's progress for B
    FakeChannel.post({ type: "auth-changed" });
    expect(window.__studyhubsBridge!.stats().storage.loggedOut).toBe(true);
    hub.saveLocal(); // A's in-memory state must not reach B's browser storage…
    expect(localStorage.getItem(LKEY)).toBeNull();
    window.dispatchEvent(new Event("pagehide")); // …or B's account
    await vi.advanceTimersByTimeAsync(600_000);
    expect(server.syncs()).toHaveLength(0);
    expect(window.__studyhubsBridge!.stats().chrome.notices).toContain("auth");
  });

  it("the same account (a fresh session) is ignored", async () => {
    await openSignedIn();
    FakeChannel.post({ type: "auth-changed" });
    expect(window.__studyhubsBridge!.stats().chrome.notices).toEqual([]);
    setVisibility("hidden");
    expect(reloads.count).toBe(0);
  });
});

describe("auth-changed after the session ended", () => {
  it("the same account signing in again reloads a page whose sync had stopped", async () => {
    const hub = await openSignedIn();
    server.fail("sync", { status: 401, body: { code: "unauthenticated" } });
    hub.touch("main");
    FakeChannel.post({ type: "flush" });
    await tick();
    expect(window.__studyhubsBridge!.stats().outbox.dead).toBe("revoked");
    FakeChannel.post({ type: "auth-changed" }); // same hint and owner as at boot
    expect(window.__studyhubsBridge!.stats().chrome.notices).toContain("auth");
    setVisibility("hidden");
    expect(reloads.count).toBe(1);
  });
});

describe("back/forward cache", () => {
  it("a restored page reloads when the account changed meanwhile", () => {
    boot();
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    expect(reloads.count).toBe(0);
    signIn("pub_A");
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: false }));
    expect(reloads.count).toBe(0);
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    expect(reloads.count).toBe(1);
  });
});
