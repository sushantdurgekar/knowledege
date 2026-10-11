/**
 * Storage.prototype.setItem / removeItem wrapper (contract §6, hub-runtime-contract §6).
 *
 * Installed in M0 because the legacy sidecar and the "storage full" notice need it, and M1's
 * outbox subscribes to it. Rules:
 *  - Only calls whose `this` is window.localStorage are inspected; sessionStorage and any other
 *    Storage pass straight through to the original.
 *  - The original runs first, and any error it throws is rethrown unchanged (the hubs' own
 *    try/catch keeps working). A QuotaExceededError on a hub key also tells the chrome.
 *  - After a successful legacy-key write the sidecar `studyhubs.legacy.<key>.upd = Date.now()`
 *    is recorded (anonymous visitors too, so newest-wins works at first sign-in).
 *  - Once `loggedOut` is set (M1 logout), hub-key writes are dropped so a closing tab cannot
 *    re-save the previous user's progress.
 *  - Assigning `localStorage.setItem = fn` would only create an item called "setItem", hence
 *    Object.defineProperty on the prototype.
 */
import { isHubKey, legacySidecarKey } from "./local-progress";
import { warn } from "./util";

export interface HubWrite {
  readonly key: string;
  /** The stored string, or null for a removal. */
  readonly value: string | null;
  readonly op: "set" | "remove";
}

/** Bridge-owned reads and writes. They bypass the wrapper and the logout guard and never throw. */
export interface RawStore {
  get(key: string): string | null;
  set(key: string, value: string): boolean;
  remove(key: string): boolean;
}

export interface StorageHookStats {
  /** Successful hub-key writes and removals seen. */
  hubWrites: number;
  /** Hub-key writes dropped by the logout guard. */
  dropped: number;
  quotaErrors: number;
  /** Legacy sidecar stamps written. */
  sidecars: number;
}

export interface StorageHook extends RawStore {
  /** False when there is no usable localStorage; the hook is then inert. */
  readonly installed: boolean;
  /** Subscribe to successful hub-key writes (M0: the nudge; M1: the outbox). Returns an unsubscriber. */
  onHubWrite(listener: (write: HubWrite) => void): () => void;
  setLoggedOut(value: boolean): void;
  isLoggedOut(): boolean;
  stats(): StorageHookStats;
  /** Restore the original methods (tests, dispose). */
  uninstall(): void;
}

export interface StorageHookOptions {
  /** The window.localStorage instance to filter on; null when storage is unavailable. */
  storage: Storage | null;
  legacyKeys: readonly string[];
  /** Defaults to Storage.prototype. */
  proto?: Storage;
  now?: () => number;
  onQuotaExceeded?: (key: string, error: unknown) => void;
}

/** QuotaExceededError across engines (Chromium/WebKit code 22, old Firefox 1014). */
export function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { name, code } = error as { name?: unknown; code?: unknown };
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" || code === 22 || code === 1014;
}

type SetItem = (this: Storage, key: string, value: string) => void;
type RemoveItem = (this: Storage, key: string) => void;

const DEFAULT_DESCRIPTOR: PropertyDescriptor = { configurable: true, enumerable: true, writable: true };

export function installStorageHook(opts: StorageHookOptions): StorageHook {
  const storage = opts.storage;
  const legacyKeys = opts.legacyKeys.slice();
  const now = opts.now || Date.now;
  const proto: Storage | null = opts.proto || (typeof Storage === "function" ? Storage.prototype : null);
  const listeners: Array<(write: HubWrite) => void> = [];
  const counters: StorageHookStats = { hubWrites: 0, dropped: 0, quotaErrors: 0, sidecars: 0 };
  let loggedOut = false;

  const setDesc = proto ? Object.getOwnPropertyDescriptor(proto, "setItem") : undefined;
  const removeDesc = proto ? Object.getOwnPropertyDescriptor(proto, "removeItem") : undefined;
  const origSet: SetItem | null = proto ? ((setDesc && setDesc.value) || proto.setItem) : null;
  const origRemove: RemoveItem | null = proto ? ((removeDesc && removeDesc.value) || proto.removeItem) : null;

  function quota(key: string, error: unknown): void {
    counters.quotaErrors++;
    try {
      if (opts.onQuotaExceeded) opts.onQuotaExceeded(key, error);
    } catch (e) {
      warn("quota handler failed", e);
    }
  }

  function afterHubWrite(key: string, value: string | null, op: HubWrite["op"]): void {
    counters.hubWrites++;
    if (op === "set" && legacyKeys.indexOf(key) >= 0 && storage && origSet) {
      try {
        origSet.call(storage, legacySidecarKey(key), String(now()));
        counters.sidecars++;
      } catch (e) {
        if (isQuotaError(e)) quota(key, e);
      }
    }
    const write: HubWrite = { key, value, op };
    for (const listener of listeners.slice()) {
      try {
        listener(write);
      } catch (e) {
        warn("hub-write listener failed", e);
      }
    }
  }

  // Named setItem/removeItem so the patched methods keep their usual names in stack traces.
  // `arguments` is forwarded as-is so argument-count errors match the native methods exactly.
  const setItem = function setItem(this: Storage, key: string, value: string): void {
    const args = arguments as unknown as [string, string];
    if (this !== storage) return origSet!.apply(this, args);
    const k = String(key);
    const hubKey = isHubKey(k, legacyKeys);
    if (hubKey && loggedOut) {
      counters.dropped++;
      return;
    }
    try {
      origSet!.apply(this, args);
    } catch (e) {
      if (hubKey && isQuotaError(e)) quota(k, e);
      throw e;
    }
    if (hubKey) afterHubWrite(k, String(value), "set");
  };

  const removeItem = function removeItem(this: Storage, key: string): void {
    const args = arguments as unknown as [string];
    if (this !== storage) return origRemove!.apply(this, args);
    origRemove!.apply(this, args);
    const k = String(key);
    if (isHubKey(k, legacyKeys)) afterHubWrite(k, null, "remove");
  };

  let installed = false;
  if (storage && proto && origSet && origRemove) {
    try {
      Object.defineProperty(proto, "setItem", { ...(setDesc || DEFAULT_DESCRIPTOR), value: setItem });
      Object.defineProperty(proto, "removeItem", { ...(removeDesc || DEFAULT_DESCRIPTOR), value: removeItem });
      installed = true;
    } catch (e) {
      warn("storage hook not installed", e);
    }
  }

  return {
    get installed() {
      return installed;
    },
    get(key) {
      try {
        return storage ? storage.getItem(key) : null;
      } catch {
        return null;
      }
    },
    set(key, value) {
      if (!storage || !origSet) return false;
      try {
        origSet.call(storage, key, value);
        return true;
      } catch {
        return false;
      }
    },
    remove(key) {
      if (!storage || !origRemove) return false;
      try {
        origRemove.call(storage, key);
        return true;
      } catch {
        return false;
      }
    },
    onHubWrite(listener) {
      listeners.push(listener);
      return () => {
        const i = listeners.indexOf(listener);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
    setLoggedOut(value) {
      loggedOut = value;
    },
    isLoggedOut() {
      return loggedOut;
    },
    stats() {
      return { ...counters };
    },
    uninstall() {
      if (!installed || !proto) return;
      installed = false;
      // Only restore what is still ours, so a later wrapper installed on top is not clobbered.
      if (proto.setItem === (setItem as unknown)) {
        Object.defineProperty(proto, "setItem", setDesc || { ...DEFAULT_DESCRIPTOR, value: origSet });
      }
      if (proto.removeItem === (removeItem as unknown)) {
        Object.defineProperty(proto, "removeItem", removeDesc || { ...DEFAULT_DESCRIPTOR, value: origRemove });
      }
      listeners.length = 0;
    },
  };
}
