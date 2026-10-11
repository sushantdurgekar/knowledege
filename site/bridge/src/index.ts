/**
 * Study Hubs bridge: the first, synchronous script of every hub page served at /h/<slug>.
 *
 * Unmodified hub files look for `window.claude.use("db" | "user" | "sample")` while they are
 * still parsing. This bridge answers them (contract §6):
 *   db / user → null (M0 is anonymous-only, so the hub stays in "Saved in this browser" mode)
 *   sample    → the AI shim (opens the "AI isn't supported here" notice)
 *   other     → rejects {code:"not_declared"}
 * It also installs the localStorage hook and mounts the floating menu. In anonymous mode it
 * makes zero network requests.
 */
import { createAiModal, createAiShim } from "./ai";
import { createChrome, type Chrome } from "./chrome";
import { readConfig, type BridgeConfig, type ScriptLike } from "./config";
import { resolveDb, resolveUser, type Session } from "./db";
import { createLegacy } from "./legacy";
import { createOutbox } from "./outbox";
import { installStorageHook, type StorageHook } from "./storage-hook";
import type { BridgeApi, BridgeStats, ClaudeShim } from "./types";
import { codedError, onDomReady, safeLocalStorage, warn } from "./util";

export const VERSION: string = typeof __SH_VERSION__ === "string" ? __SH_VERSION__ : "dev";

export interface StartOptions {
  /** The bridge's own <script> element. Defaults to document.currentScript (read synchronously). */
  script?: ScriptLike | null;
}

export interface BridgeHandle {
  readonly cfg: BridgeConfig;
  readonly api: BridgeApi;
  readonly claude: ClaudeShim;
  /** Undo everything (tests only): restore Storage methods, remove UI and globals. */
  dispose(): void;
}

/** Boot the bridge. Returns null when a bridge is already running on this page. */
export function startBridge(opts: StartOptions = {}): BridgeHandle | null {
  if (window.__studyhubsBridge) return null; // injected twice: keep the first instance

  // 1. Configuration: document.currentScript is only set while this script executes.
  const script = opts.script !== undefined ? opts.script : document.currentScript;
  const cfg = readConfig(script, safeCookie(), location);
  // TODO(M1): signedIn = !!cfg.hint && owner tag matches (studyhubs.owner); start the prefetch.
  const session: Session = { cfg, signedIn: false };

  // 2. window.claude, defined synchronously before any hub script runs.
  const modal = createAiModal(cfg, document);
  const ai = createAiShim(cfg, modal);
  const use = (name: string): Promise<unknown> => {
    switch (name) {
      case "sample":
        return Promise.resolve(ai.AI); // already resolved: keeps body.has-ai on from first paint
      case "db":
        return resolveDb(session);
      case "user":
        return resolveUser(session);
      default:
        return Promise.reject(codedError("not_declared", `capability "${String(name)}" is not available here`));
    }
  };
  const claude: ClaudeShim = Object.freeze({ use });
  try {
    window.claude = claude;
  } catch (e) {
    warn("window.claude could not be defined", e);
  }

  // 3. Storage hook (legacy sidecar, quota notice, logout guard; M1's outbox subscribes here).
  let chrome: Chrome | null = null;
  const hook: StorageHook = installStorageHook({
    storage: safeLocalStorage(window),
    legacyKeys: cfg.legacyKeys,
    onQuotaExceeded: () => {
      if (chrome) chrome.showStorageFull();
    },
  });

  // 4. Floating menu, mounted once the hub's markup is parsed.
  chrome = createChrome({ cfg, doc: document, store: hook, signedIn: () => session.signedIn });
  const ui = chrome;
  const unsubscribe = hook.onHubWrite((write) => ui.handleHubWrite(write));
  const cancelMount = onDomReady(document, () => {
    try {
      ui.mount();
    } catch (e) {
      warn("menu failed to mount", e);
    }
  });

  // 5. window.__studyhubsBridge
  const legacy = createLegacy(cfg, hook);
  const outbox = createOutbox();
  const stats = (): BridgeStats => {
    const aiStats = ai.stats();
    return {
      version: VERSION,
      hubId: cfg.hubId,
      slug: cfg.slug,
      engine: cfg.engine,
      mode: "anonymous",
      hint: cfg.hint != null,
      network: 0,
      ai: { ...aiStats, modalOpens: modal.opens(), modalOpen: modal.isOpen() },
      storage: { ...hook.stats(), hooked: hook.installed, loggedOut: hook.isLoggedOut() },
      chrome: { mounted: ui.isMounted(), notices: ui.notices() },
      legacy: legacy.stats(),
      outbox: outbox.stats(),
    };
  };
  const api: BridgeApi = Object.freeze({
    version: VERSION,
    legacySeed: (seed: unknown) => legacy.seed(seed),
    flushNow: () => outbox.flushNow(),
    stats,
  });
  window.__studyhubsBridge = api;

  return {
    cfg,
    api,
    claude,
    dispose() {
      cancelMount();
      unsubscribe();
      outbox.dispose();
      ui.dispose();
      modal.dispose();
      hook.uninstall();
      if (window.claude === claude) delete window.claude;
      if (window.__studyhubsBridge === api) delete window.__studyhubsBridge;
    },
  };
}

function safeCookie(): string {
  try {
    return document.cookie || "";
  } catch {
    return ""; // e.g. sandboxed documents
  }
}

if (__SH_AUTOSTART__) {
  try {
    startBridge();
  } catch (e) {
    warn("bridge failed to start", e);
  }
}
