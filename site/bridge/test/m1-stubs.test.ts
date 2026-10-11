/** The M1-facing modules: pure helpers that exist now, and stubs that must stay inert in M0. */
import { describe, expect, it } from "vitest";
import { readConfig } from "../src/config";
import { partFromPath, resolveDb, resolveUser, snapshotOf } from "../src/db";
import { createLegacy, parseLegacySeed, planLegacySeed } from "../src/legacy";
import { DEFAULT_POLICY, createOutbox } from "../src/outbox";
import type { RawStore } from "../src/storage-hook";
import { codeForResponse } from "../src/transport";

const cfg = readConfig({ dataset: { hubId: "ai103", slug: "ai-103" } as DOMStringMap }, "sh_hint=p1", location);

describe("db", () => {
  it("parses the only document paths the hubs use", () => {
    expect(partFromPath("progress/main")).toBe("main");
    expect(partFromPath("data/users/u1/mocks")).toBe("mocks");
    expect(partFromPath("data/users/abc_DEF-9/cards")).toBe("cards");
    for (const bad of ["progress/other", "data/users/a/b/main", "progress/main/x", "/progress/main", "", null, 42]) {
      expect(partFromPath(bad)).toBeNull();
    }
  });

  it("snapshots expose exists as a boolean property and deep-copy data()", () => {
    const payload = { hub: "ai103", upd: 5, S: { done: { m1: true } } };
    const snap = snapshotOf(payload);
    expect(snap.exists).toBe(true);
    const a = snap.data() as typeof payload;
    a.S.done.m1 = false;
    expect(snap.data()).toEqual(payload);
    expect(snapshotOf(null)).toMatchObject({ exists: false });
    expect(snapshotOf(undefined).data()).toBeUndefined();
  });

  it("M0: db and user resolve null even with a hint", async () => {
    await expect(resolveDb({ cfg, signedIn: false })).resolves.toBeNull();
    await expect(resolveUser({ cfg, signedIn: false })).resolves.toBeNull();
  });
});

describe("transport error mapping (spec §4.5)", () => {
  it.each([
    [401, undefined, "revoked"],
    [403, "csrf", "not_granted"],
    [400, "invalid", "invalid_argument"],
    [404, undefined, "invalid_argument"],
    [422, "invalid", "invalid_argument"],
    [422, "clock_skew", "unavailable"],
    [413, "too_large", "quota_exceeded"],
    [429, "rate_limited", "unavailable"],
    [429, "sync_paused", "unavailable"],
    [503, "maintenance", "unavailable"],
    [500, undefined, "unavailable"],
    [0, undefined, "unavailable"],
  ])("%i %s → %s", (status, code, expected) => {
    expect(codeForResponse(status, code)).toBe(expected);
  });
});

describe("outbox (inert in M0)", () => {
  it("flushNow resolves at once and nothing is pending", async () => {
    const outbox = createOutbox();
    await expect(outbox.flushNow()).resolves.toBeUndefined();
    expect(outbox.stats()).toEqual({ pending: 0, flushes: 0, errors: 0, lastError: null });
    expect(DEFAULT_POLICY).toMatchObject({ tier: 1, flushMs: 120000, refreshMs: 60000 });
  });
});

describe("legacy", () => {
  it("plans newest-wins seeding", () => {
    const now = 9_000;
    expect(planLegacySeed({ raw: null, sidecar: 0 }, null, now)).toEqual({ action: "none" });
    expect(planLegacySeed({ raw: null, sidecar: 0 }, { upd: 5, raw: "R" }, now)).toEqual({
      action: "apply-remote",
      upd: 5,
      raw: "R",
    });
    expect(planLegacySeed({ raw: "L", sidecar: 0 }, { upd: 5, raw: "R" }, now)).toMatchObject({
      action: "apply-remote",
    });
    expect(planLegacySeed({ raw: "L", sidecar: 7 }, { upd: 5, raw: "R" }, now)).toEqual({
      action: "push-local",
      upd: 7,
      raw: "L",
    });
    expect(planLegacySeed({ raw: "L", sidecar: 0 }, null, now)).toEqual({ action: "push-local", upd: now, raw: "L" });
    expect(planLegacySeed({ raw: "L", sidecar: 5 }, { upd: 5, raw: "R" }, now)).toEqual({ action: "none" });
  });

  it("validates seeds", () => {
    expect(parseLegacySeed({ signedIn: false })).toEqual({ signedIn: false });
    expect(parseLegacySeed({})).toBeNull();
    expect(parseLegacySeed("x")).toBeNull();
    expect(parseLegacySeed(null)).toBeNull();
  });

  it("legacySeed({signedIn:false}) is a no-op that touches no storage", () => {
    const calls: string[] = [];
    const store: RawStore = {
      get: (k) => (calls.push(`get ${k}`), null),
      set: (k) => (calls.push(`set ${k}`), true),
      remove: (k) => (calls.push(`remove ${k}`), true),
    };
    const legacy = createLegacy({ legacyKeys: ["ai901hub.v1"] }, store);
    legacy.seed({ signedIn: false });
    legacy.seed("garbage");
    expect(calls).toEqual([]);
    expect(legacy.stats()).toEqual({ seedCalls: 2, signedIn: false });
  });
});
