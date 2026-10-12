/** Shared test helpers: boot/dispose, closed-shadow-root capture, DOM ready-state control. */
import { afterEach, vi } from "vitest";
import { startBridge, type BridgeHandle } from "../src/index";
import { disposeHubs } from "./fake-hub";

export const HUB_DATA = { hubId: "ai103", slug: "ai-103", engine: "v2" } as const;
export const LEGACY_DATA = { hubId: "ai901", slug: "ai-901", engine: "legacy", legacyKeys: "ai901hub.v1" } as const;

const handles: BridgeHandle[] = [];
/** Page reloads the bridge asked for (location.reload is replaced in tests). */
export const reloads = { count: 0 };

/** The native Storage setItem, captured before any bridge wraps it: writes "from another tab". */
export const nativeSetItem = Storage.prototype.setItem;
export function otherTabWrite(key: string, value: string): void {
  nativeSetItem.call(localStorage, key, value);
}

/** Start a bridge as if injected with the given data-* attributes; disposed after each test. */
export function boot(data: Record<string, string> = { ...HUB_DATA }): BridgeHandle {
  const handle = startBridge({ script: { dataset: data as DOMStringMap }, reload: () => void reloads.count++ });
  if (!handle) throw new Error("bridge already running");
  handles.push(handle);
  return handle;
}

export function disposeAll(): void {
  while (handles.length) handles.pop()!.dispose();
}

/** Record every shadow root attached (closed roots are otherwise unreachable from tests). */
export function captureShadowRoots() {
  const roots = new Map<Element, ShadowRoot>();
  const modes: ShadowRootMode[] = [];
  const original = Element.prototype.attachShadow;
  vi.spyOn(Element.prototype, "attachShadow").mockImplementation(function (this: Element, init: ShadowRootInit) {
    const root = original.call(this, init);
    modes.push(init.mode);
    roots.set(this, root);
    return root;
  });
  return {
    modes,
    /** The shadow root of the first connected element with this tag name, or null. */
    rootOf(tag: string): ShadowRoot | null {
      for (const [el, root] of roots) if (el.tagName.toLowerCase() === tag && el.isConnected) return root;
      return null;
    },
  };
}

/** Pretend the parser is still running, so DOMContentLoaded mounting can be observed. */
export function pretendLoading(): () => void {
  const spy = vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
  return () => {
    spy.mockRestore();
    document.dispatchEvent(new Event("DOMContentLoaded"));
  };
}

export function pressKey(target: EventTarget, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const ev = new KeyboardEvent("keydown", { key, bubbles: true, composed: true, cancelable: true, ...init });
  target.dispatchEvent(ev);
  return ev;
}

/** A modern-hub progress record as the hub's saveLocal() writes it. */
export function hubRecord(mainUpd: number, done: Record<string, boolean> = {}): string {
  return JSON.stringify({ S: { v: 2, done, last: "start" }, MOCKS: [], CARDS: {}, U: { main: mainUpd, mocks: 0, cards: 0 } });
}

export function clearCookies(): void {
  for (const c of document.cookie.split(";")) {
    const name = c.split("=")[0].trim();
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

/** Signed-in visitor: the readable hint cookie the server sets with the session. */
export function signIn(publicId = "pub_A"): void {
  document.cookie = `sh_hint=${publicId}; path=/`;
}

/** Make document.visibilityState report `state` and fire visibilitychange. */
export function setVisibility(state: DocumentVisibilityState): void {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue(state);
  document.dispatchEvent(new Event("visibilitychange"));
}

/** Common per-test cleanup for files that boot the bridge. */
export function useCleanBridge(): void {
  afterEach(() => {
    disposeHubs();
    disposeAll();
    vi.useRealTimers();
    reloads.count = 0;
    localStorage.clear();
    sessionStorage.clear();
    clearCookies();
    document.documentElement.removeAttribute("data-theme");
    document.body.innerHTML = "";
    document.body.className = "";
  });
}

export const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
