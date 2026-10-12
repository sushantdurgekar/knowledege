/**
 * Study Hubs bridge: the first, synchronous script of every hub page served at /h/<slug>.
 *
 * Unmodified hub files look for `window.claude.use("db" | "user" | "sample")` while they are
 * still parsing. This bridge answers them (build-contracts §6, §13):
 *   db / user → null for anonymous visitors (the hub stays in "Saved in this browser" mode), an
 *               owner mismatch, legacy/static hubs and a failed prefetch; for a signed-in visitor
 *               on a v2 hub, the synced DB and `{id:"me", isOwner:false}` once the progress
 *               prefetch is applied (sync.ts)
 *   sample    → the AI shim (opens the "AI isn't supported here" notice)
 *   other     → rejects {code:"not_declared"}
 * It also installs the localStorage hook, mounts the floating menu and listens for auth events.
 * In anonymous mode it makes zero network requests: nothing in sync.ts is ever created.
 */
import { createAiModal, createAiShim } from "./ai";
import { clearHintCookie, cookieOf, listenAuthEvents, modeOf, readAuthState, type Mode } from "./auth-events";
import { createChrome, type Chrome } from "./chrome";
import { readConfig, type BridgeConfig, type ScriptLike } from "./config";
import { USER, type HubDb } from "./db";
import { createLegacy } from "./legacy";
import { readOwner, readProfile, writeOwner } from "./local-progress";
import type { OutboxStats } from "./outbox";
import { installStorageHook, type StorageHook } from "./storage-hook";
import { createSync, type AccountHooks, type Sync } from "./sync";
import type { BridgeApi, BridgeStats, ClaudeShim } from "./types";
import { codedError, onDomReady, safeLocalStorage, warn } from "./util";

export const VERSION: string = typeof __SH_VERSION__ === "string" ? __SH_VERSION__ : "dev";

export const MISMATCH_ID = "mismatch";

const IDLE_OUTBOX: OutboxStats = Object.freeze({
  pending: 0,
  parts: [],
  flushes: 0,
  errors: 0,
  lastError: null,
  inflight: false,
  retryAt: 0,
  hold: "",
  tier: 1,
  acked: {},
  known: {},
  dead: null,
}) as OutboxStats;

export interface StartOptions {
  /** The bridge's own <script> element. Defaults to document.currentScript (read synchronously). */
  script?: ScriptLike | null;
  /** Page reload (tests; defaults to location.reload()). */
  reload?: () => void;
}

export interface BridgeHandle {
  readonly cfg: BridgeConfig;
  readonly api: BridgeApi;
  readonly claude: ClaudeShim;
  /** Undo everything (tests only): restore Storage methods, remove UI, listeners and globals. */
  dispose(): void;
}

/** Boot the bridge. Returns null when a bridge is already running on this page. */
export function startBridge(opts: StartOptions = {}): BridgeHandle | null {
  if (window.__studyhubsBridge) return null; // injected twice: keep the first instance

  // 1. Configuration: document.currentScript is only set while this script executes.
  const script = opts.script !== undefined ? opts.script : document.currentScript;
  const cfg = readConfig(script, cookieOf(document), location);
  const reload = opts.reload || (() => location.reload());

  // 2. Storage hook (legacy sidecar, quota notice, logout guard, own-write feed for sync).
  let chrome: Chrome | null = null;
  const hook: StorageHook = installStorageHook({
    storage: safeLocalStorage(window),
    legacyKeys: cfg.legacyKeys,
    onQuotaExceeded: () => {
      if (chrome) chrome.showStorageFull();
    },
  });

  // 3. Who is this? sh_hint + studyhubs.owner (build-contracts §13).
  const boot = readAuthState(cfg.hint, hook);
  const bootMode: Mode = modeOf(boot);
  let mode: Mode = bootMode;
  const ui = (chrome = createChrome({ cfg, doc: document, store: hook, signedIn: () => mode !== "anonymous" }));
  const showMismatch = (): void =>
    ui.showNotice({
      id: MISMATCH_ID,
      text: "This browser has progress from another account",
      detail: "Sync is off on this page until you resolve it.",
      link: { href: "/account", label: "Resolve on your account page" },
      tone: "warn",
    });
  if (mode !== "anonymous") ui.setAccount(readProfile(hook, cfg.hint!) || "");
  if (mode === "mismatch") showMismatch();

  const account: AccountHooks = {
    signedOut() {
      if (mode === "anonymous") return;
      mode = "anonymous";
      clearHintCookie(document);
      ui.hideNotice(MISMATCH_ID);
      ui.setAccount(null);
    },
    claim(publicId) {
      const owner = readOwner(hook);
      if (owner && owner !== publicId) {
        mode = "mismatch";
        showMismatch();
        return false;
      }
      if (!owner) writeOwner(hook, publicId); // first sign-in claims this browser's progress
      mode = "signed-in";
      ui.setAccount(readProfile(hook, publicId) || "");
      return true;
    },
  };

  // 4. Signed-in mode: created at boot for v2 hubs (starts the prefetch), on the seed for legacy hubs.
  let sync: Sync | null = null;
  const ensureSync = (): Sync =>
    sync || (sync = createSync({ cfg, hook, chrome: ui, account, win: window, reload }));
  if (mode === "signed-in" && cfg.engine === "v2") ensureSync();
  const legacy = createLegacy({
    cfg,
    store: hook,
    signedOut: account.signedOut,
    claim: account.claim,
    start: (known, policy, publicId) => {
      if (cfg.engine === "legacy") ensureSync().startLegacy(known, policy, publicId);
    },
  });

  // 5. window.claude, defined synchronously before any hub script runs.
  const modal = createAiModal(cfg, document);
  const ai = createAiShim(cfg, modal);
  let dbPromise: Promise<HubDb | null> | null = null;
  const useDb = (): Promise<HubDb | null> =>
    dbPromise || (dbPromise = sync && cfg.engine === "v2" ? sync.useDb() : Promise.resolve(null));
  const use = (name: string): Promise<unknown> => {
    switch (name) {
      case "sample":
        return Promise.resolve(ai.AI); // already resolved: keeps body.has-ai on from first paint
      case "db":
        return useDb();
      case "user":
        return useDb().then((db) => (db ? USER : null));
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

  // 6. Listeners: own writes, auth events (BroadcastChannel "studyhubs"), the menu on DOMContentLoaded.
  const unsubscribe = hook.onHubWrite((write) => {
    if (sync) sync.onWrite(write);
    ui.handleHubWrite(write);
  });
  const stopEvents = listenAuthEvents({
    cfg,
    storage: hook,
    chrome: ui,
    win: window,
    boot,
    reload,
    flush: () => {
      if (sync) void sync.flushNow();
    },
    stop: () => {
      if (sync) sync.stop();
    },
    stale: () => mode !== bootMode || (!!sync && !!sync.stats().outbox.dead),
  });
  const cancelMount = onDomReady(document, () => {
    try {
      ui.mount();
    } catch (e) {
      warn("menu failed to mount", e);
    }
  });

  // 7. window.__studyhubsBridge
  const stats = (): BridgeStats => {
    const aiStats = ai.stats();
    const s = sync ? sync.stats() : null;
    return {
      version: VERSION,
      hubId: cfg.hubId,
      slug: cfg.slug,
      engine: cfg.engine,
      mode,
      hint: cfg.hint != null,
      network: s ? s.network : 0,
      ai: { ...aiStats, modalOpens: modal.opens(), modalOpen: modal.isOpen() },
      storage: { ...hook.stats(), hooked: hook.installed, loggedOut: hook.isLoggedOut() },
      chrome: { mounted: ui.isMounted(), notices: ui.notices() },
      legacy: legacy.stats(),
      outbox: s ? s.outbox : { ...IDLE_OUTBOX },
      sync: s ? { ready: s.ready, active: s.active, fetches: s.fetches, tabU: s.tabU } : null,
    };
  };
  const api: BridgeApi = Object.freeze({
    version: VERSION,
    legacySeed: (seed: unknown) => legacy.seed(seed),
    flushNow: () => (sync ? sync.flushNow() : Promise.resolve()),
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
      stopEvents();
      if (sync) sync.dispose();
      ui.dispose();
      modal.dispose();
      hook.uninstall();
      if (window.claude === claude) delete window.claude;
      if (window.__studyhubsBridge === api) delete window.__studyhubsBridge;
    },
  };
}

if (__SH_AUTOSTART__) {
  try {
    startBridge();
  } catch (e) {
    warn("bridge failed to start", e);
  }
}
