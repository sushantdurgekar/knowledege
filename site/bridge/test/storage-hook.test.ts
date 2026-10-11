import { afterEach, describe, expect, it, vi } from "vitest";
import { installStorageHook, isQuotaError, type HubWrite, type StorageHook } from "../src/storage-hook";

const LEGACY = ["ai901hub.v1"];
let hook: StorageHook | null = null;

function install(opts: Partial<Parameters<typeof installStorageHook>[0]> = {}): StorageHook {
  hook = installStorageHook({ storage: window.localStorage, legacyKeys: LEGACY, ...opts });
  return hook;
}

function quotaError(): DOMException {
  return new DOMException("The quota has been exceeded.", "QuotaExceededError");
}

afterEach(() => {
  hook?.uninstall();
  hook = null;
  localStorage.clear();
  sessionStorage.clear();
});

describe("storage hook: installation", () => {
  it("replaces the prototype methods with defineProperty, keeping the descriptor shape", () => {
    const before = Object.getOwnPropertyDescriptor(Storage.prototype, "setItem")!;
    const h = install();
    expect(h.installed).toBe(true);
    const after = Object.getOwnPropertyDescriptor(Storage.prototype, "setItem")!;
    expect(after.value).not.toBe(before.value);
    expect({ ...after, value: null }).toEqual({ ...before, value: null });
    localStorage.setItem("plain", "1");
    expect(Object.keys(localStorage)).toEqual(["plain"]); // no stray "setItem" item
  });

  it("uninstall restores the original methods", () => {
    const origSet = Storage.prototype.setItem;
    const origRemove = Storage.prototype.removeItem;
    const h = install();
    h.uninstall();
    expect(Storage.prototype.setItem).toBe(origSet);
    expect(Storage.prototype.removeItem).toBe(origRemove);
    expect(h.installed).toBe(false);
  });

  it("is inert without a usable localStorage", () => {
    const origSet = Storage.prototype.setItem;
    const h = install({ storage: null });
    expect(h.installed).toBe(false);
    expect(Storage.prototype.setItem).toBe(origSet);
    expect(h.get("x")).toBeNull();
    expect(h.set("x", "1")).toBe(false);
  });
});

describe("storage hook: pass-through", () => {
  it("calls the original first with the right `this` and arguments", () => {
    const setSpy = vi.spyOn(Storage.prototype, "setItem");
    const removeSpy = vi.spyOn(Storage.prototype, "removeItem");
    install();
    localStorage.setItem("studyhub.ai103.v2", "{}");
    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(setSpy.mock.contexts[0]).toBe(localStorage);
    expect(setSpy.mock.calls[0]).toEqual(["studyhub.ai103.v2", "{}"]);
    localStorage.removeItem("studyhub.ai103.v2");
    expect(removeSpy.mock.contexts[0]).toBe(localStorage);
    expect(removeSpy.mock.calls[0]).toEqual(["studyhub.ai103.v2"]);
  });

  it("leaves sessionStorage (and any other Storage) untouched", () => {
    const setSpy = vi.spyOn(Storage.prototype, "setItem");
    const h = install({ now: () => 42 });
    const seen: HubWrite[] = [];
    h.onHubWrite((w) => seen.push(w));
    sessionStorage.setItem("ai901hub.v1", "x");
    sessionStorage.setItem("studyhub.ai103.v2", "y");
    sessionStorage.removeItem("studyhub.ai103.v2");
    expect(setSpy.mock.contexts.every((c) => c === sessionStorage)).toBe(true);
    expect(sessionStorage.getItem("ai901hub.v1")).toBe("x");
    expect(seen).toEqual([]);
    expect(sessionStorage.getItem("studyhubs.legacy.ai901hub.v1.upd")).toBeNull();
    expect(localStorage.getItem("studyhubs.legacy.ai901hub.v1.upd")).toBeNull();
    expect(h.stats().hubWrites).toBe(0);
  });

  it("keeps native argument checking (setItem with one argument still throws TypeError)", () => {
    install();
    let thrown: unknown;
    try {
      (localStorage.setItem as unknown as (k: string) => void)("only-key");
    } catch (e) {
      thrown = e;
    }
    // jsdom throws from its own realm, so compare the name rather than instanceof.
    expect((thrown as Error | undefined)?.name).toBe("TypeError");
    expect(localStorage.length).toBe(0);
  });

  it("stores values exactly like the original (string coercion)", () => {
    install();
    localStorage.setItem("n", 5 as unknown as string);
    expect(localStorage.getItem("n")).toBe("5");
  });
});

describe("storage hook: errors are rethrown", () => {
  it("rethrows QuotaExceededError on a hub key and reports it once", () => {
    const err = quotaError();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw err;
    });
    const onQuotaExceeded = vi.fn();
    const h = install({ onQuotaExceeded });
    let thrown: unknown;
    try {
      localStorage.setItem("studyhub.ai103.v2", "{}");
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBe(err);
    expect(onQuotaExceeded).toHaveBeenCalledTimes(1);
    expect(onQuotaExceeded).toHaveBeenCalledWith("studyhub.ai103.v2", err);
    expect(h.stats().quotaErrors).toBe(1);
  });

  it("rethrows quota errors on non-hub keys without reporting them", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw quotaError();
    });
    const onQuotaExceeded = vi.fn();
    install({ onQuotaExceeded });
    expect(() => localStorage.setItem("site.pref", "1")).toThrow(DOMException);
    expect(onQuotaExceeded).not.toHaveBeenCalled();
  });

  it("rethrows other errors unchanged and emits no write event", () => {
    const boom = new TypeError("boom");
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw boom;
    });
    const h = install();
    const listener = vi.fn();
    h.onHubWrite(listener);
    expect(() => localStorage.removeItem("studyhub.ai103.v2")).toThrow(boom);
    expect(listener).not.toHaveBeenCalled();
  });

  it("isQuotaError recognises engine variants", () => {
    expect(isQuotaError(quotaError())).toBe(true);
    expect(isQuotaError({ name: "NS_ERROR_DOM_QUOTA_REACHED" })).toBe(true);
    expect(isQuotaError({ code: 22 })).toBe(true);
    expect(isQuotaError({ code: 1014 })).toBe(true);
    expect(isQuotaError(new Error("x"))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
  });
});

describe("storage hook: legacy sidecar and write events", () => {
  it("stamps studyhubs.legacy.<key>.upd after a legacy-key write", () => {
    const h = install({ now: () => 1_700_000_000_123 });
    localStorage.setItem("ai901hub.v1", '{"done":{"m1":true}}');
    expect(localStorage.getItem("ai901hub.v1")).toBe('{"done":{"m1":true}}');
    expect(localStorage.getItem("studyhubs.legacy.ai901hub.v1.upd")).toBe("1700000000123");
    expect(h.stats().sidecars).toBe(1);
    localStorage.setItem("studyhub.ai103.v2", "{}");
    expect(Object.keys(localStorage).filter((k) => k.indexOf("studyhubs.legacy.") === 0)).toHaveLength(1);
  });

  it("emits hub-key writes and removals to subscribers, and nothing for other keys", () => {
    const h = install();
    const seen: HubWrite[] = [];
    const off = h.onHubWrite((w) => seen.push(w));
    localStorage.setItem("studyhub.ai103.v2", "A");
    localStorage.setItem("studyhub.codeLang", "python");
    localStorage.setItem("studyhubs.ui.x", "1");
    localStorage.setItem("other", "1");
    localStorage.removeItem("studyhub.ai103.mockrun");
    expect(seen).toEqual([
      { key: "studyhub.ai103.v2", value: "A", op: "set" },
      { key: "studyhub.codeLang", value: "python", op: "set" },
      { key: "studyhub.ai103.mockrun", value: null, op: "remove" },
    ]);
    off();
    localStorage.setItem("studyhub.ai103.v2", "B");
    expect(seen).toHaveLength(3);
  });

  it("a failing subscriber never breaks the hub's write", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const h = install();
    h.onHubWrite(() => {
      throw new Error("listener bug");
    });
    expect(() => localStorage.setItem("studyhub.ai103.v2", "A")).not.toThrow();
    expect(localStorage.getItem("studyhub.ai103.v2")).toBe("A");
    expect(warn).toHaveBeenCalled();
  });

  it("raw store writes bypass the wrapper (no events, no sidecar)", () => {
    const h = install();
    const listener = vi.fn();
    h.onHubWrite(listener);
    expect(h.set("ai901hub.v1", "raw")).toBe(true);
    expect(h.get("ai901hub.v1")).toBe("raw");
    expect(h.remove("ai901hub.v1")).toBe(true);
    expect(listener).not.toHaveBeenCalled();
    expect(localStorage.getItem("studyhubs.legacy.ai901hub.v1.upd")).toBeNull();
  });
});

describe("storage hook: logout guard", () => {
  it("drops hub-key writes once loggedOut is set, and only those", () => {
    const setSpy = vi.spyOn(Storage.prototype, "setItem");
    const h = install();
    localStorage.setItem("studyhub.ai103.v2", "before");
    h.setLoggedOut(true);
    expect(h.isLoggedOut()).toBe(true);
    setSpy.mockClear();
    localStorage.setItem("studyhub.ai103.v2", "after");
    localStorage.setItem("ai901hub.v1", "after");
    expect(setSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem("studyhub.ai103.v2")).toBe("before");
    expect(localStorage.getItem("ai901hub.v1")).toBeNull();
    localStorage.setItem("studyhubs.ui.theme", "dark"); // bridge UI state is not a hub key
    localStorage.setItem("site.pref", "1");
    expect(localStorage.getItem("studyhubs.ui.theme")).toBe("dark");
    expect(localStorage.getItem("site.pref")).toBe("1");
    localStorage.removeItem("studyhub.ai103.v2"); // removals still go through
    expect(localStorage.getItem("studyhub.ai103.v2")).toBeNull();
    expect(h.stats().dropped).toBe(2);
  });
});
