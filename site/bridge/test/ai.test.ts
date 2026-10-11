import { describe, expect, it, vi } from "vitest";
import { AI_BODY, AI_TITLE, aiMessageMarkdown, createAiShim, type AiShim } from "../src/ai";
import { boot, captureShadowRoots, pressKey, tick, useCleanBridge } from "./helpers";

useCleanBridge();

const MSG_MD =
  "**AI isn't supported here.** [Download this hub](https://study-hubs.test/h/ai-103/download) " +
  "and use it in your own AI provider for Ask-AI features.";

async function getAI(): Promise<AiShim> {
  return (await window.claude!.use("sample")) as AiShim;
}

function modalHost(): HTMLElement | null {
  return document.querySelector("studyhubs-ai-dialog");
}

describe("AI shim", () => {
  it("AI() rejects {code:'cancelled', text: MSG_MD} with an absolute download link", async () => {
    boot();
    const AI = await getAI();
    const err = await AI("Explain this", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({ message: "ai_unsupported", code: "cancelled", text: MSG_MD });
    // The hub's markdown renderer only links absolute http(s) URLs.
    const link = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/.exec((err as { text: string }).text);
    expect(link && link[2]).toBe("https://study-hubs.test/h/ai-103/download");
  });

  it("aiMessageMarkdown matches the contract text", () => {
    expect(aiMessageMarkdown({ downloadUrl: "https://study-hubs.test/h/ai-103/download" })).toBe(MSG_MD);
  });

  it("returns an already-rejected promise and never calls onText (chat input, aborted signal)", async () => {
    boot();
    const AI = await getAI();
    const onText = vi.fn();
    const ctl = new AbortController();
    ctl.abort();
    let state = "pending";
    AI([{ role: "user", content: "hi" }], { signal: ctl.signal, onText, modelTier: "default" }).catch(() => {
      state = "rejected";
    });
    await Promise.resolve();
    expect(state).toBe("rejected");
    await tick();
    expect(onText).not.toHaveBeenCalled();
  });

  it("AI.json() opens the notice and resolves null", async () => {
    const handle = boot();
    const AI = await getAI();
    await expect(AI.json("grade this", { modelTier: "default" })).resolves.toBeNull();
    expect(modalHost()).not.toBeNull();
    expect(handle.api.stats().ai).toMatchObject({ jsonCalls: 1, calls: 0, modalOpens: 1, modalOpen: true });
  });

  it("still rejects in the contract shape if the modal cannot open", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { AI } = createAiShim(
      { downloadUrl: "https://x.test/h/a/download" },
      {
        open() {
          throw new Error("boom");
        },
      },
    );
    await expect(AI()).rejects.toMatchObject({ code: "cancelled" });
    await expect(AI.json()).resolves.toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});

describe("AI modal", () => {
  it("renders in a closed shadow root with dialog semantics and the contract text", async () => {
    const shadows = captureShadowRoots();
    boot();
    void (await getAI())().catch(() => undefined);
    const root = shadows.rootOf("studyhubs-ai-dialog")!;
    expect(root).not.toBeNull();
    expect(shadows.modes).toContain("closed");
    expect(modalHost()!.shadowRoot).toBeNull(); // closed: hub code cannot reach in
    const dialog = root.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(root.getElementById(dialog.getAttribute("aria-labelledby")!)!.textContent).toBe(AI_TITLE);
    expect(root.getElementById(dialog.getAttribute("aria-describedby")!)!.textContent).toBe(AI_BODY);
    expect(AI_TITLE).toBe("AI isn't supported here");
    const dl = root.querySelector("a[download]")!;
    expect(dl.getAttribute("href")).toBe("/h/ai-103/download");
    expect(dl.textContent).toBe("Download this hub");
    expect(root.querySelector("button")!.textContent).toBe("Close");
    expect(root.querySelector("style")!.textContent).toContain("z-index:2147483647");
  });

  it("opens only once while open, and again after closing", async () => {
    const handle = boot();
    const AI = await getAI();
    void AI("a").catch(() => undefined);
    void AI("b").catch(() => undefined);
    void AI.json("c");
    expect(document.querySelectorAll("studyhubs-ai-dialog")).toHaveLength(1);
    expect(handle.api.stats().ai.modalOpens).toBe(1);
    pressKey(document.body, "Escape");
    expect(modalHost()).toBeNull();
    void AI("d").catch(() => undefined);
    expect(handle.api.stats().ai).toMatchObject({ modalOpens: 2, modalOpen: true, calls: 3, jsonCalls: 1 });
  });

  it("Esc closes it and the keystroke does not reach the hub", async () => {
    boot();
    const hubKeys = vi.fn();
    document.addEventListener("keydown", hubKeys);
    void (await getAI())().catch(() => undefined);
    pressKey(document.body, "1"); // e.g. a mock-exam answer shortcut
    expect(hubKeys).not.toHaveBeenCalled();
    pressKey(document.body, "Escape");
    expect(modalHost()).toBeNull();
    expect(window.__studyhubsBridge!.stats().ai.modalOpen).toBe(false);
    pressKey(document.body, "2");
    expect(hubKeys).toHaveBeenCalledTimes(1);
    document.removeEventListener("keydown", hubKeys);
  });

  it("moves focus into the dialog and restores it to the hub's button on close", async () => {
    const shadows = captureShadowRoots();
    boot();
    const btn = document.createElement("button");
    btn.textContent = "Explain my answer with Claude";
    document.body.appendChild(btn);
    btn.focus();
    expect(document.activeElement).toBe(btn);
    void (await getAI())("x").catch(() => undefined);
    const root = shadows.rootOf("studyhubs-ai-dialog")!;
    expect(document.activeElement).toBe(modalHost());
    expect(root.activeElement).toBe(root.querySelector('[role="dialog"]'));
    pressKey(document.body, "Escape");
    expect(document.activeElement).toBe(btn);
  });

  it("restores focus to a hub button that was disabled (and blurred) before AI() ran", async () => {
    boot();
    const AI = await getAI();
    const btn = document.createElement("button");
    document.body.appendChild(btn);
    btn.focus();
    // What the hubs do: `b.disabled = true; await aiStream(...)`; Chromium then blurs the button
    // (jsdom does not, and ignores blur() on a disabled control, hence this order).
    btn.blur();
    btn.disabled = true;
    expect(document.activeElement).toBe(document.body);
    const settled = AI("x").catch(() => undefined);
    btn.disabled = false; // the hub re-enables it once the rejection settles
    await settled;
    pressKey(document.body, "Escape");
    expect(document.activeElement).toBe(btn);
  });

  it("retries focus restore when the button is still disabled at close", async () => {
    boot();
    const AI = await getAI();
    const btn = document.createElement("button");
    document.body.appendChild(btn);
    btn.focus();
    btn.disabled = true;
    void AI().catch(() => undefined);
    pressKey(document.body, "Escape");
    btn.disabled = false;
    await tick();
    expect(document.activeElement).toBe(btn);
  });

  it("traps Tab and Shift+Tab inside the dialog", async () => {
    const shadows = captureShadowRoots();
    boot();
    void (await getAI())().catch(() => undefined);
    const root = shadows.rootOf("studyhubs-ai-dialog")!;
    const dl = root.querySelector("a[download]");
    const close = root.querySelector("button");
    const tab = (shiftKey = false) => pressKey(document.body, "Tab", { shiftKey });
    expect(tab().defaultPrevented).toBe(true);
    expect(root.activeElement).toBe(dl);
    tab();
    expect(root.activeElement).toBe(close);
    tab();
    expect(root.activeElement).toBe(dl);
    tab(true);
    expect(root.activeElement).toBe(close);
  });

  it("closes from the Close button, the backdrop and after a download click", async () => {
    vi.useFakeTimers();
    try {
      const shadows = captureShadowRoots();
      boot();
      const AI = await getAI();
      const open = () => {
        void AI().catch(() => undefined);
        return shadows.rootOf("studyhubs-ai-dialog")!;
      };
      open().querySelector<HTMLButtonElement>("button")!.click();
      expect(modalHost()).toBeNull();
      open().querySelector<HTMLElement>(".bk")!.click();
      expect(modalHost()).toBeNull();
      const root = open();
      root.querySelector<HTMLElement>(".dlg")!.click(); // a click inside the dialog keeps it open
      expect(modalHost()).not.toBeNull();
      const dl = root.querySelector<HTMLAnchorElement>("a[download]")!;
      dl.addEventListener("click", (e) => e.preventDefault()); // jsdom cannot navigate/download
      dl.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      expect(modalHost()).not.toBeNull(); // the download starts first
      vi.runAllTimers();
      expect(modalHost()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("follows the hub's data-theme attribute", async () => {
    boot();
    document.documentElement.setAttribute("data-theme", "dark");
    void (await getAI())().catch(() => undefined);
    expect(modalHost()!.getAttribute("data-theme")).toBe("dark");
    document.documentElement.setAttribute("data-theme", "light");
    await tick(); // MutationObserver delivery
    expect(modalHost()!.getAttribute("data-theme")).toBe("light");
  });
});
