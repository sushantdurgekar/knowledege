/**
 * The floating menu ("chrome") shown on every hub page: a small pill with "← All hubs",
 * "Sign in" and "Download", plus a stack of notices above it.
 *
 * Placement: bottom-left on phones and tablets; bottom-centre from 861 px, where the hubs'
 * Learn rail becomes a sticky column on the left (v2 hubs above 900 px, AI-901 above 860 px)
 * whose last items would otherwise sit under the pill for good.
 *
 * Near the end of the page the notice stack steps aside (the pill stays): the hub's last
 * controls ("Next module", "Mark lab done", the last source link) cannot scroll out from
 * under it there. It comes back as soon as the page scrolls up. See notesAway().
 *
 * It lives in a closed shadow root so hub CSS (.pill, .btn, .row, ...) cannot reach it, follows
 * the hub theme (see theme.ts), is padded for safe areas and hidden in print. It sits above the
 * hub's sticky header (z-index 30) and below the hub's toast (z-index 50).
 *
 * Notices in M0:
 *  - "Progress is saved only in this browser — sign in to keep it": anonymous visitors, once
 *    the hub's progress record first has `U.main > 0` (legacy hubs: once their record holds
 *    anything). Dismissal is remembered in `studyhubs.ui.nudge.<hubId>`.
 *  - "Browser storage is full": shown when a hub write hits QuotaExceededError.
 * M1 adds sync paused / session ended / maintenance notices through the same showNotice API.
 */
import type { BridgeConfig } from "./config";
import { hasMainProgress, legacyHasProgress, nudgeKey } from "./local-progress";
import type { HubWrite, RawStore } from "./storage-hook";
import { THEME_CSS, followTheme } from "./theme";
import { escapeHtml, mountPoint, noop } from "./util";

export const NUDGE_ID = "nudge";
export const NUDGE_TEXT = "Progress is saved only in this browser — sign in to keep it";
export const STORAGE_FULL_ID = "storage-full";
export const STORAGE_FULL_TEXT = "Browser storage is full";
export const STORAGE_FULL_DETAIL = "Your latest progress may not be saved in this browser.";

export interface Notice {
  /** Stable id; showing a notice with an existing id replaces it. */
  id: string;
  text: string;
  detail?: string;
  link?: { href: string; label: string };
  tone?: "info" | "warn";
  /** Defaults to true. */
  dismissible?: boolean;
  /** Called after the visitor dismisses the notice. */
  onDismiss?: () => void;
}

export interface ChromeOptions {
  cfg: BridgeConfig;
  doc: Document;
  store: RawStore;
  /** M0 always answers false. */
  signedIn: () => boolean;
}

export interface Chrome {
  /** Build and attach the pill (on DOMContentLoaded). Idempotent. */
  mount(): void;
  isMounted(): boolean;
  showNotice(notice: Notice): void;
  hideNotice(id: string): void;
  /** Ids of the notices currently shown (or queued before mount), in display order. */
  notices(): string[];
  /** The "Browser storage is full" notice; once dismissed it stays hidden for this page. */
  showStorageFull(): void;
  /** Feed from the storage hook: shows the nudge on the first progress write. */
  handleHubWrite(write: HubWrite): void;
  dispose(): void;
}

/** Extra room (px) below the notice stack that counts as "the end of the page". */
export const AWAY_MARGIN = 64;

/**
 * Whether the notice stack should step aside (pure). All lengths are CSS px.
 * - `end`: where the page content ends, in viewport coordinates (body's bottom edge).
 * - `viewport`: the viewport height.
 * - `span`: distance from the viewport bottom to the top of the notice stack.
 * - `height`: the notice stack's own height.
 * Content that ends above the stack is never covered (short pages keep their notice). Otherwise
 * the stack goes away once less than its own height (plus AWAY_MARGIN) is left to scroll: the
 * last part of the page could not be scrolled out from under it.
 */
export function notesAway(m: { end: number; viewport: number; span: number; height: number }): boolean {
  if (m.height <= 0) return false;
  return m.end > m.viewport - m.span && m.end - m.viewport < m.height + AWAY_MARGIN;
}

/** Whether the anonymous nudge should be visible (pure; see the module comment). */
export function shouldNudge(state: { signedIn: boolean; dismissed: boolean; hasProgress: boolean }): boolean {
  return !state.signedIn && !state.dismissed && state.hasProgress;
}

const CHROME_CSS =
  ":host{all:initial!important;position:fixed!important;z-index:40!important;display:block!important;" +
  "left:calc(12px + env(safe-area-inset-left,0px))!important;bottom:calc(12px + env(safe-area-inset-bottom,0px))!important;" +
  "max-width:calc(100vw - 24px - env(safe-area-inset-left,0px) - env(safe-area-inset-right,0px))!important}" +
  "@media print{:host{display:none!important}}" +
  ".stack{display:flex;flex-direction:column;align-items:flex-start;gap:8px;font:400 13px/1.35 var(--sh-font);color:var(--sh-fg)}" +
  ".pill{box-sizing:border-box;display:inline-flex;align-items:center;gap:2px;height:36px;padding:0 4px;max-width:100%;" +
  "border-radius:999px;border:1px solid var(--sh-line);background:var(--sh-bg);box-shadow:var(--sh-shadow)}" +
  ".it{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 10px;border-radius:999px;" +
  "color:var(--sh-fg);font-weight:700;text-decoration:none;white-space:nowrap}" +
  ".it:hover{background:var(--sh-soft)}" +
  ".it:focus-visible,.lk:focus-visible,.x:focus-visible{outline:2px solid var(--sh-accent);outline-offset:2px}" +
  "@media (min-width:861px){:host{left:50%!important;transform:translateX(-50%)!important}.stack{align-items:center}}" +
  ".notes{display:flex;flex-direction:column;gap:8px;max-width:340px}" +
  ".notes:empty,.notes.away{display:none}" +
  ".note{box-sizing:border-box;display:flex;align-items:flex-start;gap:10px;padding:10px 8px 10px 12px;border-radius:10px;" +
  "border:1px solid var(--sh-line);border-left:4px solid var(--sh-accent);background:var(--sh-bg);box-shadow:var(--sh-shadow)}" +
  ".note.warn{border-left-color:var(--sh-warn)}" +
  ".msg{flex:1;margin:0}" +
  ".dt{display:block;margin-top:2px;color:var(--sh-muted)}" +
  ".lk{display:inline-block;margin-top:4px;color:var(--sh-accent);font-weight:700}" +
  ".x{box-sizing:border-box;flex:none;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;" +
  "padding:0;margin:-3px 0;border:0;border-radius:6px;background:transparent;color:var(--sh-muted);font:400 18px/1 var(--sh-font);cursor:pointer}" +
  ".x:hover{background:var(--sh-soft);color:var(--sh-fg)}" +
  "@media (max-width:420px){.it{padding:0 8px}.stack{font-size:12px}}";

export function createChrome(opts: ChromeOptions): Chrome {
  const { cfg, doc, store } = opts;
  const notices: Notice[] = [];
  const dismissedThisPage: Record<string, true> = {};
  let host: HTMLElement | null = null;
  let notesEl: HTMLElement | null = null;
  let stopTheme: () => void = noop;
  let stopAway: () => void = noop;
  // Last measured size of the visible notice stack (it measures 0 while stepped aside).
  let notesSpan = 0;
  let notesHeight = 0;
  // The nudge is decided once per page: after it is shown (or known to be dismissed) we stop
  // parsing the hub's record on every save.
  let nudgeSettled = false;

  function render(): void {
    if (!notesEl) return;
    notesEl.innerHTML = notices
      .map((n) => {
        const detail = n.detail ? `<span class="dt">${escapeHtml(n.detail)}</span>` : "";
        const link = n.link
          ? `<br><a class="lk" href="${escapeHtml(n.link.href)}">${escapeHtml(n.link.label)}</a>`
          : "";
        const close =
          n.dismissible === false
            ? ""
            : `<button class="x" type="button" data-dismiss="${escapeHtml(n.id)}" aria-label="Dismiss">×</button>`;
        return (
          `<div class="note${n.tone === "warn" ? " warn" : ""}" data-id="${escapeHtml(n.id)}">` +
          `<p class="msg">${escapeHtml(n.text)}${detail}${link}</p>${close}</div>`
        );
      })
      .join("");
    // New content: measure it in place, then decide again.
    notesEl.classList.remove("away");
    syncAway();
  }

  /** Show or hide the notice stack for the current scroll position (see notesAway). */
  function syncAway(): void {
    const win = doc.defaultView;
    if (!notesEl || !win) return;
    const viewport = win.innerHeight;
    if (!notesEl.classList.contains("away") && notesEl.offsetHeight > 0) {
      notesHeight = notesEl.offsetHeight;
      notesSpan = viewport - notesEl.getBoundingClientRect().top;
    }
    const body = doc.body;
    const end = body
      ? body.getBoundingClientRect().bottom
      : (doc.scrollingElement || doc.documentElement).scrollHeight - win.scrollY;
    const away = notices.length > 0 && notesAway({ end, viewport, span: notesSpan, height: notesHeight });
    if (away !== notesEl.classList.contains("away")) notesEl.classList.toggle("away", away);
  }

  /** Re-check on scroll, resize and content changes (a hub tab switch changes the page height). */
  function watchScroll(): () => void {
    const win = doc.defaultView;
    if (!win) return noop;
    const opts: AddEventListenerOptions = { passive: true };
    win.addEventListener("scroll", syncAway, opts);
    win.addEventListener("resize", syncAway, opts);
    let observer: ResizeObserver | null = null;
    const RO = (win as Window & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    if (typeof RO === "function" && doc.body) {
      observer = new RO(() => syncAway());
      observer.observe(doc.body);
    }
    return () => {
      win.removeEventListener("scroll", syncAway);
      win.removeEventListener("resize", syncAway);
      if (observer) observer.disconnect();
    };
  }

  function showNotice(notice: Notice): void {
    const i = notices.findIndex((n) => n.id === notice.id);
    if (i >= 0) notices[i] = notice;
    else notices.push(notice);
    render();
  }

  function hideNotice(id: string): void {
    const i = notices.findIndex((n) => n.id === id);
    if (i < 0) return;
    notices.splice(i, 1);
    render();
  }

  function dismiss(id: string): void {
    const notice = notices.find((n) => n.id === id);
    if (!notice) return;
    dismissedThisPage[id] = true;
    hideNotice(id);
    if (notice.onDismiss) notice.onDismiss();
  }

  function isNudgeDismissed(): boolean {
    return store.get(nudgeKey(cfg.hubId)) != null;
  }

  function showNudge(): void {
    nudgeSettled = true;
    showNotice({
      id: NUDGE_ID,
      text: NUDGE_TEXT,
      link: { href: cfg.signInPath, label: "Sign in" },
      onDismiss: () => {
        store.set(nudgeKey(cfg.hubId), String(Date.now()));
      },
    });
  }

  /** True if `raw` (the value of `key`) shows learner progress for this hub. */
  function progressIn(key: string, raw: string | null): boolean {
    if (cfg.engine === "legacy") return cfg.legacyKeys.indexOf(key) >= 0 && legacyHasProgress(raw);
    return key === cfg.lkey && hasMainProgress(raw);
  }

  function storedProgress(): boolean {
    const keys = cfg.engine === "legacy" ? cfg.legacyKeys : [cfg.lkey];
    return keys.some((k) => progressIn(k, store.get(k)));
  }

  /** Decide the nudge from what is already stored (called at mount). */
  function evaluateNudge(): void {
    if (nudgeSettled) return;
    const signedIn = opts.signedIn();
    const dismissed = isNudgeDismissed();
    if (signedIn || dismissed) {
      nudgeSettled = true;
      return;
    }
    if (shouldNudge({ signedIn, dismissed, hasProgress: storedProgress() })) showNudge();
  }

  return {
    mount() {
      if (host) return;
      host = doc.createElement("studyhubs-chrome");
      const root = host.attachShadow({ mode: "closed" });
      const link = (href: string, label: string, extra = ""): string =>
        `<a class="it" href="${escapeHtml(href)}"${extra}>${label}</a>`;
      root.innerHTML =
        `<style>${THEME_CSS}${CHROME_CSS}</style>` +
        '<div class="stack">' +
        '<div class="notes" role="status" aria-live="polite"></div>' +
        '<nav class="pill" aria-label="Study Hubs">' +
        link(cfg.catalogPath, '<span aria-hidden="true">←</span> All hubs') +
        link(cfg.signInPath, "Sign in") +
        link(cfg.downloadPath, "Download", " download") +
        "</nav></div>";
      notesEl = root.querySelector<HTMLElement>(".notes");
      notesEl!.addEventListener("click", (e) => {
        const btn = (e.target as Element | null)?.closest?.("[data-dismiss]");
        if (btn) dismiss(btn.getAttribute("data-dismiss") || "");
      });
      stopTheme = followTheme(host, doc);
      mountPoint(doc).appendChild(host);
      stopAway = watchScroll();
      render();
      evaluateNudge();
    },
    isMounted: () => !!host && host.isConnected,
    showNotice,
    hideNotice,
    notices: () => notices.map((n) => n.id),
    showStorageFull() {
      if (dismissedThisPage[STORAGE_FULL_ID]) return;
      showNotice({ id: STORAGE_FULL_ID, text: STORAGE_FULL_TEXT, detail: STORAGE_FULL_DETAIL, tone: "warn" });
    },
    handleHubWrite(write) {
      if (nudgeSettled || write.op !== "set") return;
      // Before mount, evaluateNudge() at mount time reads the same record from storage.
      if (!host) return;
      if (opts.signedIn() || isNudgeDismissed()) {
        nudgeSettled = true;
        return;
      }
      if (progressIn(write.key, write.value)) showNudge();
    },
    dispose() {
      stopTheme();
      stopTheme = noop;
      stopAway();
      stopAway = noop;
      if (host) host.remove();
      host = null;
      notesEl = null;
      notices.length = 0;
    },
  };
}
