import { describe, expect, it } from "vitest";
import { startBridge } from "../src/index";
import { boot, useCleanBridge } from "./helpers";

useCleanBridge();

/** What the modern hub engines do in initSync() and initAI() (hub-runtime-contract §2). */
async function hubBoot() {
  const claude = window.claude!;
  let db: unknown = "unset";
  let user: unknown = "unset";
  try {
    [db, user] = await Promise.all([claude.use("db"), claude.use("user")]);
  } catch {
    db = user = "rejected";
  }
  let AI: unknown = null;
  try {
    AI = await claude.use("sample");
  } catch {
    AI = null;
  }
  document.body.classList.toggle("has-ai", !!AI);
  return { db, user, AI };
}

describe("window.claude", () => {
  it("is defined synchronously as a frozen object with use()", () => {
    boot();
    expect(window.claude).toBeDefined();
    expect(typeof window.claude!.use).toBe("function");
    expect(Object.isFrozen(window.claude)).toBe(true);
  });

  it("anonymous: db and user resolve null, sample resolves the AI shim, has-ai stays on", async () => {
    const handle = boot();
    const { db, user, AI } = await hubBoot();
    expect(db).toBeNull();
    expect(user).toBeNull();
    expect(typeof AI).toBe("function");
    expect(typeof (AI as { json: unknown }).json).toBe("function");
    expect(document.body.classList.contains("has-ai")).toBe(true);
    expect(handle.api.stats().mode).toBe("anonymous");
  });

  it("M0 with an sh_hint cookie: db and user still resolve null", async () => {
    document.cookie = "sh_hint=pub_abc; path=/";
    const handle = boot();
    expect(handle.cfg.hint).toBe("pub_abc");
    const { db, user } = await hubBoot();
    expect(db).toBeNull();
    expect(user).toBeNull();
    expect(handle.api.stats().hint).toBe(true);
  });

  it("use('sample') settles in the first microtask (no 'hidden AI buttons' paint)", async () => {
    boot();
    let got: unknown;
    void window.claude!.use("sample").then((ai) => (got = ai));
    await Promise.resolve();
    expect(typeof got).toBe("function");
  });

  it("use('db') and use('user') settle within microtasks", async () => {
    boot();
    let settled = 0;
    void Promise.all([window.claude!.use("db"), window.claude!.use("user")]).then(() => settled++);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(settled).toBe(1);
  });

  it("always returns the same AI function", async () => {
    boot();
    const a = await window.claude!.use("sample");
    const b = await window.claude!.use("sample");
    expect(a).toBe(b);
  });

  it.each(["storage", "", "SAMPLE", "fetch", undefined as unknown as string])(
    "rejects unknown capability %j with code not_declared",
    async (name) => {
      boot();
      await expect(window.claude!.use(name)).rejects.toMatchObject({ code: "not_declared" });
    },
  );
});

describe("window.__studyhubsBridge", () => {
  it("exposes version, legacySeed, flushNow and stats", async () => {
    const handle = boot();
    const api = window.__studyhubsBridge!;
    expect(api).toBe(handle.api);
    expect(Object.isFrozen(api)).toBe(true);
    expect(api.version).toBe("test");
    expect(api.legacySeed({ signedIn: false })).toBeUndefined();
    await expect(api.flushNow()).resolves.toBeUndefined();
    expect(api.stats()).toMatchObject({
      version: "test",
      hubId: "ai103",
      slug: "ai-103",
      engine: "v2",
      mode: "anonymous",
      hint: false,
      network: 0,
      legacy: { seedCalls: 1, signedIn: false },
      outbox: { pending: 0, flushes: 0 },
    });
  });

  it("keeps the first instance when injected twice", () => {
    const first = boot();
    expect(startBridge({ script: { dataset: { hubId: "other", slug: "other" } as DOMStringMap } })).toBeNull();
    expect(window.__studyhubsBridge).toBe(first.api);
    expect(window.__studyhubsBridge!.stats().hubId).toBe("ai103");
  });

  it("dispose removes the globals", () => {
    const handle = boot();
    handle.dispose();
    expect(window.claude).toBeUndefined();
    expect(window.__studyhubsBridge).toBeUndefined();
  });
});
