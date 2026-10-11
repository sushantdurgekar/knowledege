import { describe, expect, it, vi } from "vitest";
import {
  AWAY_MARGIN,
  NUDGE_ID,
  NUDGE_TEXT,
  STORAGE_FULL_ID,
  STORAGE_FULL_TEXT,
  createChrome,
  notesAway,
  shouldNudge,
} from "../src/chrome";
import { readConfig } from "../src/config";
import type { RawStore } from "../src/storage-hook";
import {
  LEGACY_DATA,
  boot,
  captureShadowRoots,
  hubRecord,
  pretendLoading,
  tick,
  useCleanBridge,
} from "./helpers";

useCleanBridge();

const host = (): HTMLElement | null => document.querySelector("studyhubs-chrome");

function notesText(root: ShadowRoot): string[] {
  return Array.from(root.querySelectorAll(".note .msg")).map((n) => n.textContent || "");
}

describe("chrome: pill", () => {
  it("mounts on DOMContentLoaded, not before", () => {
    const finishParsing = pretendLoading();
    const handle = boot();
    expect(host()).toBeNull();
    expect(handle.api.stats().chrome.mounted).toBe(false);
    finishParsing();
    expect(host()).not.toBeNull();
    expect(handle.api.stats().chrome.mounted).toBe(true);
  });

  it("renders the three items in a closed shadow root", () => {
    const shadows = captureShadowRoots();
    boot();
    const root = shadows.rootOf("studyhubs-chrome")!;
    expect(host()!.shadowRoot).toBeNull();
    expect(shadows.modes.every((m) => m === "closed")).toBe(true);
    const links = Array.from(root.querySelectorAll<HTMLAnchorElement>("nav a"));
    expect(links.map((a) => [a.textContent, a.getAttribute("href"), a.hasAttribute("download")])).toEqual([
      ["← All hubs", "/", false],
      ["Sign in", "/signin?next=/h/ai-103", false],
      ["Download", "/h/ai-103/download", true],
    ]);
  });

  it("is safe-area padded, hidden in print and references no URLs in CSS", () => {
    const shadows = captureShadowRoots();
    boot();
    const css = shadows.rootOf("studyhubs-chrome")!.querySelector("style")!.textContent!;
    expect(css).toContain("env(safe-area-inset-bottom");
    expect(css).toContain("env(safe-area-inset-left");
    expect(css).toMatch(/@media print\{:host\{display:none!important\}\}/);
    expect(css).toContain("prefers-color-scheme:dark");
    expect(css).not.toMatch(/url\(|@import/);
  });

  it("mirrors the hub's data-theme onto its host", async () => {
    document.documentElement.setAttribute("data-theme", "dark");
    boot();
    expect(host()!.getAttribute("data-theme")).toBe("dark");
    document.documentElement.removeAttribute("data-theme");
    await tick();
    expect(host()!.hasAttribute("data-theme")).toBe(false);
  });
});

describe("chrome: anonymous nudge", () => {
  it("stays hidden until the hub's LKEY first gets U.main > 0", () => {
    const shadows = captureShadowRoots();
    const handle = boot();
    const root = shadows.rootOf("studyhubs-chrome")!;
    localStorage.setItem("studyhub.ai103.v2", hubRecord(0)); // first render: S.last only
    expect(handle.api.stats().chrome.notices).toEqual([]);
    localStorage.setItem("studyhub.ai103.mockrun", "{}");
    localStorage.setItem("studyhub.other.v2", hubRecord(Date.now())); // another hub's key
    expect(handle.api.stats().chrome.notices).toEqual([]);
    localStorage.setItem("studyhub.ai103.v2", hubRecord(Date.now()));
    expect(handle.api.stats().chrome.notices).toEqual([NUDGE_ID]);
    expect(notesText(root)[0]).toBe(`${NUDGE_TEXT}Sign in`);
    expect(root.querySelector(".note a")!.getAttribute("href")).toBe("/signin?next=/h/ai-103");
  });

  it("shows at mount when progress is already stored", () => {
    localStorage.setItem("studyhub.ai103.v2", hubRecord(123));
    const handle = boot();
    expect(handle.api.stats().chrome.notices).toEqual([NUDGE_ID]);
  });

  it("remembers dismissal in studyhubs.ui.nudge.<hubId>", () => {
    const shadows = captureShadowRoots();
    localStorage.setItem("studyhub.ai103.v2", hubRecord(123));
    const handle = boot();
    const root = shadows.rootOf("studyhubs-chrome")!;
    root.querySelector<HTMLButtonElement>('[data-dismiss="nudge"]')!.click();
    expect(handle.api.stats().chrome.notices).toEqual([]);
    expect(Number(localStorage.getItem("studyhubs.ui.nudge.ai103"))).toBeGreaterThan(0);
    localStorage.setItem("studyhub.ai103.v2", hubRecord(456));
    expect(handle.api.stats().chrome.notices).toEqual([]);
    // Next page load: still dismissed.
    handle.dispose();
    const again = boot();
    expect(again.api.stats().chrome.notices).toEqual([]);
  });

  it("legacy hubs: shows once the legacy record holds progress", () => {
    const handle = boot({ ...LEGACY_DATA });
    localStorage.setItem("ai901hub.v1", JSON.stringify({ done: {}, plan: {}, mistakes: [], mockHist: [] }));
    expect(handle.api.stats().chrome.notices).toEqual([]);
    localStorage.setItem("ai901hub.v1", JSON.stringify({ done: { m1: true }, plan: {}, mistakes: [], mockHist: [] }));
    expect(handle.api.stats().chrome.notices).toEqual([NUDGE_ID]);
  });

  it("never shows for signed-in visitors", () => {
    const store: RawStore = { get: () => hubRecord(5), set: () => true, remove: () => true };
    const cfg = readConfig({ dataset: { hubId: "ai103", slug: "ai-103" } as DOMStringMap }, "", location);
    const chrome = createChrome({ cfg, doc: document, store, signedIn: () => true });
    chrome.mount();
    chrome.handleHubWrite({ key: cfg.lkey, value: hubRecord(9), op: "set" });
    expect(chrome.notices()).toEqual([]);
    chrome.dispose();
  });

  it("shouldNudge truth table", () => {
    expect(shouldNudge({ signedIn: false, dismissed: false, hasProgress: true })).toBe(true);
    expect(shouldNudge({ signedIn: false, dismissed: false, hasProgress: false })).toBe(false);
    expect(shouldNudge({ signedIn: false, dismissed: true, hasProgress: true })).toBe(false);
    expect(shouldNudge({ signedIn: true, dismissed: false, hasProgress: true })).toBe(false);
  });
});

describe("chrome: notices", () => {
  it("shows 'Browser storage is full' when a hub write hits the quota", () => {
    const shadows = captureShadowRoots();
    // The "native" setItem the hook wraps: throws while `full` is set.
    const realSet = Storage.prototype.setItem;
    let full = false;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k: string, v: string) {
      if (full) throw new DOMException("full", "QuotaExceededError");
      realSet.call(this, k, v);
    });
    const handle = boot();
    full = true;
    // The hub's saveLocal() swallows the error itself; the bridge must still rethrow it.
    expect(() => localStorage.setItem("studyhub.ai103.v2", hubRecord(1))).toThrow(DOMException);
    full = false;
    expect(handle.api.stats().chrome.notices).toEqual([STORAGE_FULL_ID]);
    expect(handle.api.stats().storage.quotaErrors).toBe(1);
    const root = shadows.rootOf("studyhubs-chrome")!;
    expect(notesText(root)[0]).toContain(STORAGE_FULL_TEXT);
    expect(root.querySelector(".note")!.classList.contains("warn")).toBe(true);
    expect(root.querySelector(".notes")!.getAttribute("aria-live")).toBe("polite");
  });

  it("queues notices raised before mount and keeps a dismissed storage notice hidden", () => {
    const store: RawStore = { get: () => null, set: () => true, remove: () => true };
    const cfg = readConfig({ dataset: { hubId: "ai103", slug: "ai-103" } as DOMStringMap }, "", location);
    const shadows = captureShadowRoots();
    const chrome = createChrome({ cfg, doc: document, store, signedIn: () => false });
    chrome.showStorageFull();
    chrome.showStorageFull(); // same id: replaced, not duplicated
    expect(chrome.notices()).toEqual([STORAGE_FULL_ID]);
    chrome.mount();
    const root = shadows.rootOf("studyhubs-chrome")!;
    expect(root.querySelectorAll(".note")).toHaveLength(1);
    root.querySelector<HTMLButtonElement>(`[data-dismiss="${STORAGE_FULL_ID}"]`)!.click();
    expect(chrome.notices()).toEqual([]);
    chrome.showStorageFull();
    expect(chrome.notices()).toEqual([]);
    chrome.showNotice({ id: "m1", text: "Sync paused", dismissible: false });
    expect(root.querySelector('[data-id="m1"] [data-dismiss]')).toBeNull();
    chrome.hideNotice("m1");
    expect(chrome.notices()).toEqual([]);
    chrome.dispose();
  });

  it("escapes notice text", () => {
    const store: RawStore = { get: () => null, set: () => true, remove: () => true };
    const cfg = readConfig({ dataset: { hubId: "ai103", slug: "ai-103" } as DOMStringMap }, "", location);
    const shadows = captureShadowRoots();
    const chrome = createChrome({ cfg, doc: document, store, signedIn: () => false });
    chrome.mount();
    chrome.showNotice({ id: "x", text: "<img src=x onerror=alert(1)>" });
    const root = shadows.rootOf("studyhubs-chrome")!;
    expect(root.querySelector("img")).toBeNull();
    expect(notesText(root)[0]).toBe("<img src=x onerror=alert(1)>");
    chrome.dispose();
  });
});

/**
 * jsdom has no layout, so the geometry syncAway() reads is faked: the notice stack is
 * NOTES_H tall with its top NOTES_SPAN above the viewport bottom while shown, and the page
 * content ends at `layout.end` (body's bottom edge, viewport coordinates).
 */
const NOTES_H = 120;
const NOTES_SPAN = 176; // 12 px offset + 36 px pill + 8 px gap + the stack
function fakeLayout() {
  const layout = { end: 5000 };
  const shown = (el: Element): boolean =>
    el.classList.contains("notes") && !el.classList.contains("away") && el.childElementCount > 0;
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
    return shown(this) ? NOTES_H : 0;
  });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const r = { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
    if (this === document.body) Object.assign(r, { bottom: layout.end, height: layout.end });
    else if (shown(this)) Object.assign(r, { top: innerHeight - NOTES_SPAN, bottom: innerHeight - 56, height: NOTES_H });
    return { ...r, toJSON: () => r } as DOMRect;
  });
  return layout;
}

describe("chrome: placement", () => {
  it("sits bottom-left on phones and bottom-centre from 861 px, clear of the sticky Learn rail", () => {
    const shadows = captureShadowRoots();
    boot();
    const css = shadows.rootOf("studyhubs-chrome")!.querySelector("style")!.textContent!;
    expect(css).toContain("left:calc(12px + env(safe-area-inset-left,0px))!important");
    expect(css).toContain(
      "@media (min-width:861px){:host{left:50%!important;transform:translateX(-50%)!important}.stack{align-items:center}}",
    );
    expect(css).toContain(".notes:empty,.notes.away{display:none}");
  });

  it("notesAway: steps aside only where the page end would stay under the stack", () => {
    const at = (end: number) => notesAway({ end, viewport: 800, span: NOTES_SPAN, height: NOTES_H });
    expect(at(5000)).toBe(false); // far from the end: the content can still scroll out from under it
    expect(at(800 + NOTES_H + AWAY_MARGIN)).toBe(false);
    expect(at(800 + NOTES_H + AWAY_MARGIN - 1)).toBe(true);
    expect(at(800)).toBe(true); // at the very end
    expect(at(800 - NOTES_SPAN + 1)).toBe(true); // short page whose content reaches the stack
    expect(at(800 - NOTES_SPAN)).toBe(false); // short page that ends above the stack
    expect(notesAway({ end: 800, viewport: 800, span: 0, height: 0 })).toBe(false); // nothing measured
  });
});

describe("chrome: notices near the end of the page", () => {
  const notesOf = (shadows: ReturnType<typeof captureShadowRoots>) =>
    shadows.rootOf("studyhubs-chrome")!.querySelector<HTMLElement>(".notes")!;
  const scrollTo = (layout: { end: number }, end: number, type = "scroll") => {
    layout.end = end;
    window.dispatchEvent(new Event(type));
  };

  it("hides the notice stack (not the pill) at the page end and brings it back on scroll up", () => {
    const layout = fakeLayout();
    const shadows = captureShadowRoots();
    localStorage.setItem("studyhub.ai103.v2", hubRecord(123));
    const handle = boot();
    const notes = notesOf(shadows);
    expect(handle.api.stats().chrome.notices).toEqual([NUDGE_ID]);
    expect(notes.classList.contains("away")).toBe(false);

    scrollTo(layout, innerHeight + 40); // "Next module" territory
    expect(notes.classList.contains("away")).toBe(true);
    expect(handle.api.stats().chrome.notices).toEqual([NUDGE_ID]); // still pending, only stepped aside
    expect(shadows.rootOf("studyhubs-chrome")!.querySelector("nav.pill")).not.toBeNull();

    scrollTo(layout, innerHeight + 900);
    expect(notes.classList.contains("away")).toBe(false);
    scrollTo(layout, innerHeight, "resize");
    expect(notes.classList.contains("away")).toBe(true);
  });

  it("keeps the notice on a short page whose content ends above it", () => {
    const layout = fakeLayout();
    layout.end = 300;
    const shadows = captureShadowRoots();
    localStorage.setItem("studyhub.ai103.v2", hubRecord(123));
    boot();
    expect(notesOf(shadows).classList.contains("away")).toBe(false);
    scrollTo(layout, innerHeight - NOTES_SPAN + 20); // content now reaches under the stack
    expect(notesOf(shadows).classList.contains("away")).toBe(true);
  });

  it("decides again when a notice arrives at the page end, and stops listening when disposed", () => {
    const layout = fakeLayout();
    layout.end = innerHeight; // already at the end when the first notice appears
    const shadows = captureShadowRoots();
    const handle = boot();
    const notes = notesOf(shadows);
    localStorage.setItem("studyhub.ai103.v2", hubRecord(Date.now()));
    expect(handle.api.stats().chrome.notices).toEqual([NUDGE_ID]);
    expect(notes.classList.contains("away")).toBe(true);
    handle.dispose();
    scrollTo(layout, 5000);
    expect(notes.classList.contains("away")).toBe(true); // no listener left behind
  });
});
