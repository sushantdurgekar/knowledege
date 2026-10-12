/**
 * Who this page belongs to, and what happens when that changes (build-contracts §13, spec §4.5
 * "Auth events").
 *
 *  - `sh_hint` (readable cookie, the user's publicId) present → signed in; `studyhubs.owner` is
 *    the account this browser's local progress belongs to. `mismatch` = both set and different:
 *    the page then stays local and the chrome asks the user to resolve it on /account.
 *  - BroadcastChannel "studyhubs" (sent by the site shell):
 *      {type:"flush"}        push pending progress now (the sign-out page asks before it ends the session)
 *      {type:"auth-changed"} a sign-in happened in another tab: hidden tabs reload; visible tabs
 *                            show "Signed in — reload to sync" and reload on the next visibility
 *                            change unless a mock exam is running (studyhub.<id>.mockrun)
 *      {type:"logout"}       set the logout guard (hub-key writes are dropped, set() rejects
 *                            "revoked"), wipe this browser's progress, reload
 *  - If the account behind the page changed (another hint or owner than at boot), this tab's
 *    in-memory progress belongs to the previous account: the logout guard goes on and sync stops
 *    at once, so nothing of it can reach the new account before the reload.
 *  - A page restored from the back/forward cache re-checks hint and owner and reloads if either changed.
 */
import type { Chrome } from "./chrome";
import { HINT_COOKIE, readCookie, type BridgeConfig } from "./config";
import { mockRunKey, readOwner, wipeKeys, type StorageLike } from "./local-progress";
import { warn } from "./util";

export const CHANNEL = "studyhubs";

export type Mode = "anonymous" | "signed-in" | "mismatch";

export interface AuthState {
  hint: string | null;
  owner: string | null;
  mismatch: boolean;
}

export function readAuthState(hint: string | null, storage: StorageLike): AuthState {
  const owner = readOwner(storage);
  return { hint, owner, mismatch: !!hint && !!owner && owner !== hint };
}

export function modeOf(state: AuthState): Mode {
  return !state.hint ? "anonymous" : state.mismatch ? "mismatch" : "signed-in";
}

export function cookieOf(doc: Document): string {
  try {
    return doc.cookie || "";
  } catch {
    return ""; // e.g. sandboxed documents
  }
}

/** Remove `sh_hint` (the server said nobody is signed in). */
export function clearHintCookie(doc: Document): void {
  try {
    const secure = doc.location && doc.location.protocol === "https:" ? "; Secure" : "";
    doc.cookie = `${HINT_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
  } catch {
    /* ignore */
  }
}

/** The pieces of the storage hook the auth events need. */
export interface GuardedStorage extends StorageLike {
  setLoggedOut(value: boolean): void;
}

export interface AuthEventsOptions {
  cfg: Pick<BridgeConfig, "hubId" | "legacyKeys">;
  storage: GuardedStorage;
  chrome: Pick<Chrome, "showNotice">;
  win: Window;
  /** Hint and owner when the page booted. */
  boot: AuthState;
  /** Push pending progress now. */
  flush(): void;
  /** Sync must stop for this page (logout, or the browser now belongs to another account). */
  stop(): void;
  /** True when this page no longer syncs as it booted (session ended, turned anonymous): a sign-in, even to the same account, needs a reload. */
  stale?: () => boolean;
  reload?: () => void;
}

export const AUTH_NOTICE_ID = "auth";

export function listenAuthEvents(o: AuthEventsOptions): () => void {
  const { win } = o;
  const doc = win.document;
  const reload = o.reload || (() => win.location.reload());
  let reloadOnVisibility = false;

  const now = (): AuthState => readAuthState(readCookie(cookieOf(doc), HINT_COOKIE), o.storage);
  /** Still the page's own account (this page may have claimed the owner tag itself since boot). */
  const same = (s: AuthState): boolean =>
    s.hint === o.boot.hint && (s.owner === o.boot.owner || (!!s.hint && s.owner === s.hint));
  /** The account behind this page is no longer the one it booted with. */
  const switched = (s: AuthState): boolean =>
    (!!o.boot.hint && s.hint !== o.boot.hint) || (!!o.boot.owner && s.owner !== o.boot.owner);

  function guard(): void {
    o.storage.setLoggedOut(true);
    o.stop();
  }

  function authChanged(): void {
    const s = now();
    if (same(s) && !(o.stale && o.stale())) return; // e.g. a fresh session for the same account
    const other = switched(s);
    if (other) guard();
    if (doc.visibilityState === "hidden") return reload();
    o.chrome.showNotice({
      id: AUTH_NOTICE_ID,
      text: other ? "You signed in with another account — reload this page" : "Signed in — reload to sync",
      action: { label: "Reload", run: reload },
      tone: other ? "warn" : "info",
      dismissible: !other,
    });
    reloadOnVisibility = true;
  }

  function onMessage(ev: MessageEvent): void {
    const type = ev && ev.data && (ev.data as { type?: unknown }).type;
    if (type === "flush") o.flush();
    else if (type === "auth-changed") authChanged();
    else if (type === "logout") {
      guard();
      wipeKeys(o.storage, o.cfg.legacyKeys);
      reload();
    }
  }

  function onVisibility(): void {
    if (reloadOnVisibility && o.storage.getItem(mockRunKey(o.cfg.hubId)) == null) reload();
  }

  function onPageShow(ev: Event): void {
    if (!(ev as PageTransitionEvent).persisted) return;
    if (!same(now())) reload();
  }

  let channel: BroadcastChannel | null = null;
  const BC = (win as Window & { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel;
  if (typeof BC === "function") {
    try {
      channel = new BC(CHANNEL);
      channel.addEventListener("message", onMessage);
    } catch (e) {
      warn("BroadcastChannel unavailable", e);
    }
  }
  doc.addEventListener("visibilitychange", onVisibility);
  win.addEventListener("pageshow", onPageShow);
  return () => {
    if (channel) channel.close();
    doc.removeEventListener("visibilitychange", onVisibility);
    win.removeEventListener("pageshow", onPageShow);
  };
}
