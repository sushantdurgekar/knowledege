/**
 * Contract §6/§13: in anonymous mode (and on an owner mismatch) the bridge makes ZERO network
 * requests. Every request API a script can reach is replaced by a spy, then a whole hub session
 * is simulated.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { AiShim } from "../src/ai";
import { LEGACY_DATA, boot, captureShadowRoots, hubRecord, pretendLoading, useCleanBridge } from "./helpers";

useCleanBridge();

const RESOURCE_TAGS = new Set(["SCRIPT", "LINK", "IMG", "IFRAME", "AUDIO", "VIDEO", "SOURCE", "OBJECT", "EMBED"]);

let spies: Record<string, MockInstance<(...args: any[]) => any>>;
let added: Element[];
let observer: MutationObserver;

beforeEach(() => {
  spies = {
    fetch: vi.fn(),
    sendBeacon: vi.fn(),
    WebSocket: vi.fn(),
    EventSource: vi.fn(),
    Image: vi.fn(),
  };
  vi.stubGlobal("fetch", spies.fetch);
  vi.stubGlobal("WebSocket", spies.WebSocket);
  vi.stubGlobal("EventSource", spies.EventSource);
  vi.stubGlobal("Image", spies.Image);
  spies.xhrOpen = vi.spyOn(XMLHttpRequest.prototype, "open").mockImplementation(() => undefined);
  spies.xhrSend = vi.spyOn(XMLHttpRequest.prototype, "send").mockImplementation(() => undefined);
  Object.defineProperty(navigator, "sendBeacon", { value: spies.sendBeacon, configurable: true, writable: true });
  added = [];
  observer = new MutationObserver((records) => {
    for (const r of records) r.addedNodes.forEach((n) => n instanceof Element && added.push(n));
  });
  observer.observe(document, { childList: true, subtree: true });
});

afterEach(() => {
  observer.disconnect();
  delete (navigator as { sendBeacon?: unknown }).sendBeacon;
});

function expectNoRequests(): void {
  for (const [name, spy] of Object.entries(spies)) expect(spy, name).not.toHaveBeenCalled();
  const resources = added.filter((el) => RESOURCE_TAGS.has(el.tagName));
  expect(resources.map((el) => el.outerHTML)).toEqual([]);
}

async function simulateHubSession(): Promise<void> {
  const claude = window.claude!;
  await Promise.all([claude.use("db"), claude.use("user")]);
  const AI = (await claude.use("sample")) as AiShim;
  await claude.use("nope").catch(() => undefined);
  localStorage.setItem("studyhub.ai103.v2", hubRecord(0));
  localStorage.setItem("studyhub.ai103.v2", hubRecord(Date.now(), { m1: true })); // → nudge
  localStorage.setItem("studyhub.ai103.mockrun", "{}");
  localStorage.removeItem("studyhub.ai103.mockrun");
  await AI("Explain", { onText: () => undefined }).catch(() => undefined);
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }));
  await AI.json("Grade");
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }));
  await window.__studyhubsBridge!.flushNow();
  window.__studyhubsBridge!.stats();
  document.dispatchEvent(new Event("visibilitychange"));
  window.dispatchEvent(new Event("pagehide"));
}

describe("anonymous mode makes zero network requests", () => {
  it("modern hub: boot, DOMContentLoaded, use(), AI paths, progress writes, unload events", async () => {
    const shadows = captureShadowRoots();
    const finishParsing = pretendLoading();
    const handle = boot();
    finishParsing();
    await simulateHubSession();
    expectNoRequests();
    expect(handle.api.stats()).toMatchObject({ network: 0, chrome: { mounted: true, notices: ["nudge"] } });
    // Nothing inside the closed shadow roots loads anything either.
    for (const tag of ["studyhubs-chrome", "studyhubs-ai-dialog"]) {
      const root = shadows.rootOf(tag);
      if (!root) continue;
      expect(root.querySelector("link,img,script,iframe,object,embed")).toBeNull();
      expect(root.innerHTML).not.toMatch(/url\(|@import/);
    }
  });

  it("legacy hub with its anonymous seed script", async () => {
    const finishParsing = pretendLoading();
    boot({ ...LEGACY_DATA });
    window.__studyhubsBridge!.legacySeed({ signedIn: false }); // what /api/seed/ai901.js runs
    localStorage.setItem("ai901hub.v1", JSON.stringify({ done: { m1: true } }));
    finishParsing();
    await window.__studyhubsBridge!.flushNow();
    expectNoRequests();
  });

  it("owner mismatch (signed in, another account's progress here) makes no requests either", async () => {
    document.cookie = "sh_hint=pub_123; path=/";
    localStorage.setItem("studyhubs.owner", "pub_other");
    const finishParsing = pretendLoading();
    const handle = boot();
    finishParsing();
    await simulateHubSession();
    expectNoRequests();
    expect(handle.api.stats().mode).toBe("mismatch");
  });

  it("a hint on a static hub makes no requests", async () => {
    document.cookie = "sh_hint=pub_123; path=/";
    boot({ hubId: "x1", slug: "x-1", engine: "static" });
    await simulateHubSession();
    expectNoRequests();
  });
});
