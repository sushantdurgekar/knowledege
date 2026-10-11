/**
 * The AI capability (`use("sample")`): there is no AI on the site, so every call opens the
 * "AI isn't supported here" modal and fails in the one shape the hubs handle quietly.
 *
 * Why this exact shape (docs/hub-runtime-contract.md §2.3 and §8, prototype scenario 7):
 *  - `use("sample")` must resolve to a truthy callable, or the hub hides every AI button.
 *  - AI() rejects `{code:"cancelled", text: MSG_MD}`: the Explain path renders `text` inline
 *    (with a working absolute download link) and shows no error note. The promise is already
 *    rejected when returned, so "Thinking…" never paints. `onText` is never called and
 *    `signal` is ignored.
 *  - AI.json() resolves null: every caller treats null as "nothing to show", so Teach-back and
 *    Fresh questions clear their "Thinking…" without a "Stopped." line.
 *  - The hub cannot show the message on chat, interview or JSON paths, hence the modal.
 */
import type { BridgeConfig } from "./config";
import { THEME_CSS, followTheme } from "./theme";
import { codedError, escapeHtml, mountPoint, noop, warn } from "./util";

export const AI_TITLE = "AI isn't supported here";
export const AI_BODY =
  "Download this hub and use it in your own AI provider for Ask-AI features (for example, upload it to " +
  "Claude and open it as an artifact). Your progress on this site isn't included in the file.";

/** The markdown the hub renders under "Explain my answer" (contract §6 MSG_MD). */
export function aiMessageMarkdown(cfg: Pick<BridgeConfig, "downloadUrl">): string {
  return (
    "**AI isn't supported here.** [Download this hub](" +
    cfg.downloadUrl +
    ") and use it in your own AI provider for Ask-AI features."
  );
}

export interface AiShim {
  (input?: unknown, opts?: unknown): Promise<never>;
  json(input?: unknown, opts?: unknown): Promise<null>;
}

export interface AiModal {
  /** Open the modal; ignored while it is already open (one at a time). */
  open(): void;
  close(): void;
  isOpen(): boolean;
  /** How many times the modal has been opened on this page. */
  opens(): number;
  dispose(): void;
}

const MODAL_CSS =
  ":host{all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;display:block!important}" +
  ".bk{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;box-sizing:border-box;" +
  "padding:max(16px,env(safe-area-inset-top,0px)) max(16px,env(safe-area-inset-right,0px)) " +
  "max(16px,env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px));" +
  "background:rgba(10,14,20,.55);font:400 15px/1.5 var(--sh-font);color:var(--sh-fg)}" +
  ".dlg{box-sizing:border-box;width:100%;max-width:440px;max-height:100%;overflow:auto;padding:22px 22px 18px;" +
  "border-radius:12px;border:1px solid var(--sh-line);background:var(--sh-bg);color:var(--sh-fg);box-shadow:0 18px 50px rgba(0,0,0,.35)}" +
  ".dlg:focus{outline:none}" +
  "h2{margin:0 0 8px;font:700 19px/1.25 var(--sh-display)}" +
  "p{margin:0 0 18px}" +
  ".row{display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end}" +
  ".b{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:9px 16px;" +
  "border-radius:8px;border:1px solid var(--sh-line);background:var(--sh-bg);color:var(--sh-fg);" +
  "font:700 15px/1.2 var(--sh-font);text-decoration:none;cursor:pointer}" +
  ".b:hover{background:var(--sh-soft)}" +
  ".b.pri{background:var(--sh-accent);border-color:var(--sh-accent);color:var(--sh-accent-ink)}" +
  ".b.pri:hover{filter:brightness(1.08)}" +
  ".b:focus-visible{outline:3px solid var(--sh-accent);outline-offset:2px}" +
  "@media (prefers-reduced-motion:no-preference){.dlg{animation:sh-pop .14s ease-out}}" +
  "@keyframes sh-pop{from{transform:translateY(6px);opacity:0}to{transform:none;opacity:1}}";

export function createAiModal(cfg: Pick<BridgeConfig, "downloadPath">, doc: Document): AiModal {
  const win = doc.defaultView;
  let host: HTMLElement | null = null;
  let dialog: HTMLElement | null = null;
  let focusables: HTMLElement[] = [];
  let root: ShadowRoot | null = null;
  let restoreTo: HTMLElement | null = null;
  /** Last element focused in the page outside the modal (see activeElement()). */
  let lastFocused: HTMLElement | null = null;
  let stopTheme: () => void = noop;
  let open = false;
  let openCount = 0;

  // The hubs disable their AI button right before calling AI() (`b.disabled = true; await
  // aiStream(...)`), which blurs it, so at open() time document.activeElement is already
  // <body>. Remembering the last focused element lets close() hand focus back to that button.
  const trackFocus = (e: FocusEvent): void => {
    if (!open && e.target instanceof HTMLElement && e.target !== host) lastFocused = e.target;
  };
  doc.addEventListener("focusin", trackFocus, true);

  function build(): HTMLElement {
    const el = doc.createElement("studyhubs-ai-dialog");
    root = el.attachShadow({ mode: "closed" });
    root.innerHTML =
      `<style>${THEME_CSS}${MODAL_CSS}</style>` +
      '<div class="bk" part="backdrop">' +
      '<div class="dlg" role="dialog" aria-modal="true" aria-labelledby="sh-ai-t" aria-describedby="sh-ai-d" tabindex="-1">' +
      `<h2 id="sh-ai-t">${escapeHtml(AI_TITLE)}</h2>` +
      `<p id="sh-ai-d">${escapeHtml(AI_BODY)}</p>` +
      '<div class="row">' +
      `<a class="b pri" data-dl download href="${escapeHtml(cfg.downloadPath)}">Download this hub</a>` +
      '<button class="b" type="button" data-close>Close</button>' +
      "</div></div></div>";
    dialog = root.querySelector<HTMLElement>(".dlg");
    const dl = root.querySelector<HTMLElement>("[data-dl]")!;
    const closeBtn = root.querySelector<HTMLElement>("[data-close]")!;
    focusables = [dl, closeBtn];
    closeBtn.addEventListener("click", () => close());
    // Let the download start first, then get out of the way.
    dl.addEventListener("click", () => setTimeout(close, 0));
    const backdrop = root.querySelector<HTMLElement>(".bk")!;
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close();
    });
    return el;
  }

  /** Keyboard while open: Esc closes, Tab cycles inside the dialog, nothing reaches the hub. */
  function onKeydown(e: KeyboardEvent): void {
    if (!open) return;
    // The hub's own shortcuts (e.g. in a mock exam) must not act behind a modal dialog.
    e.stopPropagation();
    if (e.key === "Escape" || e.key === "Esc") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      e.preventDefault();
      const i = focusables.indexOf(root!.activeElement as HTMLElement);
      const last = focusables.length - 1;
      const next = e.shiftKey ? (i <= 0 ? last : i - 1) : i < 0 || i === last ? 0 : i + 1;
      focusables[next].focus();
    }
  }

  /** Focus that escapes the dialog (e.g. a click-through or assistive tech) is pulled back. */
  function onFocusIn(e: FocusEvent): void {
    if (open && host && e.target !== host && dialog) dialog.focus();
  }

  /** Where focus should return on close: the focused element, else the last one focused. */
  function activeElement(): HTMLElement | null {
    const el = doc.activeElement;
    if (el && el !== doc.body && el !== doc.documentElement && typeof (el as HTMLElement).focus === "function") {
      return el as HTMLElement;
    }
    return lastFocused && lastFocused.isConnected ? lastFocused : null;
  }

  function restoreFocus(target: HTMLElement): void {
    const attempt = (): void => {
      if (!target.isConnected || open) return;
      try {
        target.focus({ preventScroll: true });
      } catch {
        /* element no longer focusable */
      }
    };
    attempt();
    // Still disabled by the hub (its AI call has not settled yet)? Try once more after it has.
    if (doc.activeElement !== target) setTimeout(attempt, 0);
  }

  function close(): void {
    if (!open || !host) return;
    open = false;
    if (win) win.removeEventListener("keydown", onKeydown, true);
    doc.removeEventListener("focusin", onFocusIn, true);
    stopTheme();
    stopTheme = noop;
    host.remove();
    const target = restoreTo;
    restoreTo = null;
    if (target) restoreFocus(target);
  }

  return {
    open() {
      if (open) return;
      if (!host) host = build();
      restoreTo = activeElement();
      mountPoint(doc).appendChild(host);
      stopTheme = followTheme(host, doc);
      if (win) win.addEventListener("keydown", onKeydown, true);
      doc.addEventListener("focusin", onFocusIn, true);
      open = true;
      openCount++;
      if (dialog) dialog.focus();
    },
    close,
    isOpen: () => open,
    opens: () => openCount,
    dispose() {
      close();
      doc.removeEventListener("focusin", trackFocus, true);
      host = null;
      root = null;
      dialog = null;
      focusables = [];
    },
  };
}

export interface AiCounters {
  calls: number;
  jsonCalls: number;
}

/** The function `use("sample")` resolves to. Never touches the network. */
export function createAiShim(cfg: Pick<BridgeConfig, "downloadUrl">, modal: Pick<AiModal, "open">) {
  const counters: AiCounters = { calls: 0, jsonCalls: 0 };
  const text = aiMessageMarkdown(cfg);

  function showModal(): void {
    try {
      modal.open();
    } catch (e) {
      warn("AI notice failed to open", e); // still answer the hub below
    }
  }

  const AI = function AI(): Promise<never> {
    counters.calls++;
    showModal();
    return Promise.reject(codedError("cancelled", "ai_unsupported", { text }));
  } as AiShim;

  AI.json = function json(): Promise<null> {
    counters.jsonCalls++;
    showModal();
    return Promise.resolve(null);
  };

  return { AI: Object.freeze(AI) as AiShim, stats: (): AiCounters => ({ ...counters }) };
}
