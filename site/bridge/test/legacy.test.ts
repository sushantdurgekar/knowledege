/**
 * Legacy (AI-901) sync (spec §4.5 "Legacy", build-contracts §13): the seed script runs before the
 * hub reads its storage; newest wins against the sidecar stamp; hub writes are queued; a tab that
 * comes back after refreshMs offers a reload when the server has newer progress.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLegacy, parseLegacySeed, planLegacySeed } from "../src/legacy";
import { readSynced, type StorageLike } from "../src/local-progress";
import type { RawStore } from "../src/storage-hook";
import { fakeServer, type FakeServer } from "./fake-server";
import { LEGACY_DATA, boot, captureShadowRoots, reloads, setVisibility, signIn, useCleanBridge } from "./helpers";

useCleanBridge();

const KEY = "ai901hub.v1";
const SIDE = "studyhubs.legacy.ai901hub.v1.upd";
const T0 = Date.parse("2026-10-12T10:00:00Z");
const POLICY = { tier: 1, flushMs: 120000, hiddenMinMs: 0, refreshMs: 60000, pausedUntil: null };
let server: FakeServer;

const raw = (done: Record<string, boolean>) => JSON.stringify({ done, plan: {}, mistakes: [], mockHist: [] });
const seed = (parts: Record<string, unknown> = {}, publicId = "pub_A") => ({ signedIn: true, publicId, policy: POLICY, parts });

async function tick(): Promise<void> {
  for (let i = 0; i < 12; i++) await vi.advanceTimersByTimeAsync(0);
}

/** Boot as injected, run the seed script, then "the hub" reads its key (line 873). */
function openLegacy(seedValue: unknown): string | null {
  boot({ ...LEGACY_DATA });
  window.__studyhubsBridge!.legacySeed(seedValue);
  return localStorage.getItem(KEY);
}

beforeEach(() => {
  vi.useFakeTimers({ now: T0 });
  server = fakeServer();
});

describe("seed planning", () => {
  it("plans newest-wins seeding", () => {
    const now = 9_000;
    expect(planLegacySeed({ raw: null, sidecar: 0 }, null, now)).toEqual({ action: "none" });
    expect(planLegacySeed({ raw: null, sidecar: 0 }, { upd: 5, raw: "R" }, now)).toEqual({ action: "apply-remote", upd: 5, raw: "R" });
    expect(planLegacySeed({ raw: "L", sidecar: 0 }, { upd: 5, raw: "R" }, now)).toMatchObject({ action: "apply-remote" });
    expect(planLegacySeed({ raw: "L", sidecar: 7 }, { upd: 5, raw: "R" }, now)).toEqual({ action: "push-local", upd: 7, raw: "L" });
    expect(planLegacySeed({ raw: "L", sidecar: 0 }, null, now)).toEqual({ action: "push-local", upd: now, raw: "L" });
    expect(planLegacySeed({ raw: "L", sidecar: 5 }, { upd: 5, raw: "R" }, now)).toEqual({ action: "none" });
  });

  it("validates seeds", () => {
    expect(parseLegacySeed({ signedIn: false })).toEqual({ signedIn: false });
    expect(parseLegacySeed({})).toBeNull();
    expect(parseLegacySeed("x")).toBeNull();
    expect(parseLegacySeed(null)).toBeNull();
  });

  it("an anonymous seed touches no storage and asks nothing", () => {
    const calls: string[] = [];
    const store = {
      get: (k: string) => (calls.push(`get ${k}`), null),
      set: (k: string) => (calls.push(`set ${k}`), true),
      remove: (k: string) => (calls.push(`remove ${k}`), true),
      getItem: (k: string) => (calls.push(`getItem ${k}`), null),
      setItem: (k: string) => void calls.push(`setItem ${k}`),
      removeItem: (k: string) => void calls.push(`removeItem ${k}`),
      key: () => null,
      length: 0,
    } as RawStore & StorageLike;
    let signedOut = 0;
    const legacy = createLegacy({
      cfg: { hubId: "ai901", legacyKeys: [KEY] },
      store,
      signedOut: () => void signedOut++,
      claim: () => true,
      start: () => undefined,
    });
    legacy.seed({ signedIn: false });
    legacy.seed("garbage");
    expect(calls).toEqual([]);
    expect(signedOut).toBe(1);
    expect(legacy.stats()).toEqual({ seedCalls: 2, signedIn: false });
  });
});

describe("seed when signed in", () => {
  it("anonymous seed with a stale hint: anonymous mode, hint cleared, no request", () => {
    signIn();
    openLegacy({ signedIn: false });
    expect(document.cookie).not.toContain("sh_hint");
    expect(window.__studyhubsBridge!.stats()).toMatchObject({ mode: "anonymous", network: 0 });
  });

  it("remote newer than the sidecar: written with the original setItem before the hub reads it", async () => {
    localStorage.setItem(KEY, raw({ m1: true }));
    localStorage.setItem(SIDE, String(T0 - 5000));
    signIn();
    const seen = openLegacy(seed({ legacy: { upd: T0 - 100, raw: raw({ m1: true, m2: true }) } }));
    expect(JSON.parse(seen!).done).toEqual({ m1: true, m2: true });
    expect(localStorage.getItem(SIDE)).toBe(String(T0 - 100));
    expect(readSynced(localStorage, "ai901").legacy).toBe(T0 - 100);
    expect(localStorage.getItem("studyhubs.owner")).toBe("pub_A");
    const stats = window.__studyhubsBridge!.stats();
    expect(stats.storage.hubWrites).toBe(0); // no hook event: nothing is queued
    expect(stats).toMatchObject({ mode: "signed-in", legacy: { seedCalls: 1, signedIn: true }, sync: { active: true } });
    await vi.advanceTimersByTimeAsync(600_000);
    expect(server.syncs()).toHaveLength(0);
  });

  it("local newer: queued as part legacy and sent at the end of the window (merge at first sign-in)", async () => {
    localStorage.setItem(KEY, raw({ m1: true, m3: true }));
    localStorage.setItem(SIDE, String(T0 - 10));
    signIn();
    const seen = openLegacy(seed({ legacy: { upd: T0 - 9000, raw: raw({}) } }));
    expect(JSON.parse(seen!).done).toEqual({ m1: true, m3: true });
    await vi.advanceTimersByTimeAsync(120_000);
    await tick();
    expect(server.syncs()).toHaveLength(1);
    expect(server.syncs()[0].body).toEqual({
      hubs: { ai901: { legacy: { hub: "ai901", upd: T0 - 10, key: KEY, raw: raw({ m1: true, m3: true }) } } },
    });
    expect(readSynced(localStorage, "ai901").legacy).toBe(T0 - 10);
  });

  it("local without a sidecar and nothing on the server: stamped now and pushed", async () => {
    localStorage.setItem(KEY, raw({ m5: true }));
    signIn();
    openLegacy(seed({}));
    expect(localStorage.getItem(SIDE)).toBe(String(T0));
    window.dispatchEvent(new Event("pagehide"));
    await tick();
    expect(server.store.ai901.legacy).toMatchObject({ upd: T0, key: KEY });
  });

  it("an empty browser and an empty server: nothing happens", async () => {
    signIn();
    expect(openLegacy(seed({}))).toBeNull();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(server.syncs()).toHaveLength(0);
  });

  it("owner mismatch: local data left alone, nothing sent, the mismatch notice", async () => {
    localStorage.setItem("studyhubs.owner", "pub_B");
    localStorage.setItem(KEY, raw({ mine: true }));
    localStorage.setItem(SIDE, String(T0 - 10));
    signIn("pub_B");
    const seen = openLegacy(seed({ legacy: { upd: T0, raw: raw({ theirs: true }) } }, "pub_A"));
    expect(JSON.parse(seen!).done).toEqual({ mine: true });
    localStorage.setItem(KEY, raw({ mine: true, more: true }));
    window.dispatchEvent(new Event("pagehide"));
    await vi.advanceTimersByTimeAsync(600_000);
    expect(server.calls).toEqual([]);
    expect(window.__studyhubsBridge!.stats()).toMatchObject({ mode: "mismatch", chrome: { notices: ["mismatch"] } });
  });

  it("hub writes are stamped and queued; a second seed call is ignored", async () => {
    signIn();
    openLegacy(seed({}));
    vi.setSystemTime(T0 + 3000);
    localStorage.setItem(KEY, raw({ m1: true })); // the hub's save()
    expect(localStorage.getItem(SIDE)).toBe(String(T0 + 3000));
    window.__studyhubsBridge!.legacySeed(seed({ legacy: { upd: T0 + 99999, raw: raw({ evil: true }) } }));
    expect(JSON.parse(localStorage.getItem(KEY)!).done).toEqual({ m1: true });
    await vi.advanceTimersByTimeAsync(120_000);
    await tick();
    expect(server.store.ai901.legacy).toMatchObject({ upd: T0 + 3000, raw: raw({ m1: true }) });
  });

  it("fetches the profile initial once after the seed", async () => {
    signIn();
    const shadows = captureShadowRoots();
    openLegacy(seed({}));
    await tick();
    expect(server.calls.map((c) => c.path)).toEqual(["/api/me"]);
    expect(shadows.rootOf("studyhubs-chrome")!.querySelector(".av")!.textContent).toBe("S");
  });
});

describe("mid-session check", () => {
  it("visible again after refreshMs: GET known=legacy:<sidecar>; newer remote → Reload notice, never automatic", async () => {
    localStorage.setItem(KEY, raw({ m1: true }));
    localStorage.setItem(SIDE, String(T0 - 10));
    localStorage.setItem("studyhubs.profile", JSON.stringify({ id: "pub_A", initial: "S" }));
    signIn();
    const shadows = captureShadowRoots();
    openLegacy(seed({ legacy: { upd: T0 - 10, raw: raw({ m1: true }) } }));
    setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(30_000);
    setVisibility("visible"); // too soon: no request
    await tick();
    expect(server.progressGets()).toHaveLength(0);
    server.store.ai901 = { legacy: { hub: "ai901", upd: T0 + 40_000, key: KEY, raw: raw({ m1: true, m2: true }) } };
    await vi.advanceTimersByTimeAsync(31_000);
    setVisibility("visible");
    await tick();
    expect(server.progressGets()).toHaveLength(1);
    expect(server.progressGets()[0].path).toBe("/api/progress/ai901");
    expect(server.progressGets()[0].query).toBe(`?known=legacy:${T0 - 10}`);
    expect(window.__studyhubsBridge!.stats().chrome.notices).toContain("newer");
    expect(reloads.count).toBe(0);
    const btn = shadows.rootOf("studyhubs-chrome")!.querySelector<HTMLButtonElement>('[data-act="newer"]')!;
    expect(btn.textContent).toBe("Reload");
    btn.click();
    expect(reloads.count).toBe(1);
  });

  it("a stub (nothing newer) shows nothing", async () => {
    localStorage.setItem(KEY, raw({ m1: true }));
    localStorage.setItem(SIDE, String(T0 - 10));
    server.store.ai901 = { legacy: { hub: "ai901", upd: T0 - 10, key: KEY, raw: raw({ m1: true }) } };
    signIn();
    openLegacy(seed({ legacy: { upd: T0 - 10, raw: raw({ m1: true }) } }));
    await vi.advanceTimersByTimeAsync(61_000);
    setVisibility("visible");
    await tick();
    expect(server.progressGets()).toHaveLength(1);
    expect(window.__studyhubsBridge!.stats().chrome.notices).not.toContain("newer");
  });
});
