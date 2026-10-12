/**
 * Signed-in mode (build-contracts §13, spec §4.5): wires the transport, the outbox, the db cache,
 * the legacy part, the page-lifecycle listeners and the chrome notices.
 *
 * Created only for a visitor with the `sh_hint` cookie on a v2 hub (at boot, which starts the
 * progress prefetch at once) or when a legacy seed says signed in. Anonymous pages never create
 * one, so they make no request at all.
 *
 * Prefetch (v2): GET /api/progress/<hubId>?known=<tabU>, 5 s timeout. use("db")/use("user")
 * wait for it, then resolve:
 *   signed-in reply      → the owner tag is checked (claimed if absent) → DB (or null on mismatch)
 *   {signedIn:false}/401 → null; anonymous from now on, sh_hint cleared
 *   timeout, 503 maintenance, 400/403/404/422 → null
 *   429 / 5xx / network  → DB anyway: get() rejects "unavailable" ("Sync paused") until the server
 *                          answers, and changes queue in the outbox meanwhile.
 */
import type { Chrome } from "./chrome";
import type { BridgeConfig } from "./config";
import { createDb, isSignedInReply, type HubDb } from "./db";
import {
  PARTS,
  buildPart,
  legacyPart,
  legacySidecarKey,
  parseHubRecord,
  readProfile,
  writeProfile,
  type AnyPart,
  type PartStamps,
} from "./local-progress";
import { createOutbox, type OutboxEvent, type OutboxStats, type Payload } from "./outbox";
import type { HubWrite, StorageHook } from "./storage-hook";
import { PREFETCH_TIMEOUT_MS, createTransport, loadFflate, type Reply, type Transport } from "./transport";
import { warn } from "./util";

/** What sync needs to know about (and tell) the page's account state (index.ts). */
export interface AccountHooks {
  /** The server says nobody is signed in: anonymous from now on (sh_hint is cleared). */
  signedOut(): void;
  /** Check (and on first sign-in, claim) the owner tag; false when this browser's progress belongs to another account. */
  claim(publicId: string): boolean;
}

export interface SyncOptions {
  cfg: BridgeConfig;
  hook: StorageHook;
  chrome: Chrome;
  account: AccountHooks;
  win: Window;
  transport?: Transport;
  reload?: () => void;
  now?: () => number;
  random?: () => number;
}

export interface SyncStats {
  /** Requests made (fetch calls plus the lazy fflate script). */
  network: number;
  /** The server's copy is known (prefetch applied, or legacy seed received). */
  ready: boolean;
  /** Sync is live: the hub holds the db, or the legacy seed started it. */
  active: boolean;
  fetches: number;
  tabU: PartStamps;
  outbox: OutboxStats;
}

export interface Sync {
  /** use("db") on a v2 hub: the DB after the prefetch, or null (see the module comment). */
  useDb(): Promise<HubDb | null>;
  /** A valid signed-in legacy seed was applied: start syncing the legacy part. */
  startLegacy(known: number, policy: unknown, publicId: string): void;
  /** Feed from the storage hook (own LKEY / legacy-key writes). */
  onWrite(write: HubWrite): void;
  flushNow(): Promise<void>;
  /** Logout or account switch: no request leaves this page any more. */
  stop(): void;
  stats(): SyncStats;
  dispose(): void;
}

export const SYNCED_PILL = '<span class="dot"></span>Synced to your account';

/** "12:30 PM IST", with the weekday when it is not today. */
export function localTime(ms: number, now: number): string {
  const d = new Date(ms);
  const opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", timeZoneName: "short" };
  if (d.toDateString() !== new Date(now).toDateString()) opts.weekday = "short";
  try {
    return d.toLocaleString([], opts);
  } catch {
    return d.toISOString();
  }
}

export function createSync(o: SyncOptions): Sync {
  const { cfg, hook, chrome, win } = o;
  const doc = win.document;
  const now = o.now || Date.now;
  const legacy = cfg.engine === "legacy";
  const key = cfg.legacyKeys[0] || "";
  const transport = o.transport || createTransport(now);
  const rec0 = parseHubRecord(hook.getItem(cfg.lkey));
  /** Stamps of the record this tab loaded (what the hub is about to read) or last wrote itself. */
  const tabU: PartStamps = rec0 ? { ...rec0.U } : { main: 0, mocks: 0, cards: 0 };
  let ready = false;
  let active = false;
  let gzipLoads = 0;
  let lastCheck = 0;
  let dbPromise: Promise<HubDb | null> | null = null;

  const notice = (id: string, text: string, detail: string): void =>
    chrome.showNotice({ id, text, detail, tone: "warn" });

  function sessionEnded(): void {
    chrome.showNotice({
      id: "session",
      text: "Session ended — sign in to sync",
      detail: "Progress is saved in this browser.",
      link: { href: cfg.signInPath, label: "Sign in" },
      tone: "warn",
    });
  }

  function maintenance(m: unknown, message?: string): void {
    const mm = m && typeof m === "object" ? (m as Record<string, unknown>) : null;
    if (mm && (mm.mode === "off" || !mm.mode)) return chrome.hideNotice("maintenance");
    const msg = message || (mm && typeof mm.message === "string" ? mm.message : "");
    const until = mm && typeof mm.until === "string" ? Date.parse(mm.until) : NaN;
    const back = until > 0 ? ` Back at ${localTime(until, now())}.` : "";
    notice("maintenance", "Site maintenance: sync is paused", `${msg || "Progress is saved in this browser."}${back}`);
  }

  /** The hub's "Sync paused" pill after a background success (cosmetic; the hub owns the pill). */
  function syncedPill(): void {
    try {
      const el = doc.getElementById("syncPill");
      if (el && el.classList.contains("mid")) {
        el.className = "pill ok";
        el.innerHTML = SYNCED_PILL;
      }
    } catch {
      /* not a v2 hub page */
    }
  }

  function onEvent(e: OutboxEvent): void {
    if (e.type === "ok") {
      chrome.hideNotice("paused");
      chrome.hideNotice("clock");
      chrome.hideNotice("maintenance");
      if (e.clean && !outbox.stats().pending) syncedPill();
    } else if (e.type === "resumed") chrome.hideNotice("paused");
    else if (e.type === "paused") {
      notice("paused", "Cloud sync is paused", `Progress is saved in this browser. Sync resumes at ${localTime(e.until, now())}.`);
    } else if (e.type === "skew") {
      notice("clock", "Your device clock is ahead", "Set the correct date and time to sync. Progress is saved in this browser.");
    } else if (e.type === "maintenance") maintenance(null, e.message);
    else if (e.type === "too_large") {
      notice("too-large", "Some progress is too large to sync", "It is still saved in this browser.");
    } else if (e.code === "revoked") sessionEnded();
    else warn(`sync stopped (${e.code})`);
  }

  const outbox = createOutbox({
    hubId: cfg.hubId,
    parts: legacy ? ["legacy"] : PARTS,
    localParts() {
      const out: Partial<Record<AnyPart, Payload>> = {};
      if (legacy) {
        const part = key ? legacyPart(hook, cfg.hubId, key) : null;
        if (part) out.legacy = part;
        return out;
      }
      const rec = parseHubRecord(hook.getItem(cfg.lkey));
      if (rec) for (const p of PARTS) out[p] = buildPart(rec, p, cfg.hubId) || undefined;
      return out;
    },
    transport,
    storage: hook,
    gzip: () => (win.__shFflate ? win.__shFflate.gzipSync : null),
    loadGzip() {
      gzipLoads++;
      loadFflate(doc);
    },
    now,
    random: o.random,
    onAck: (p, sent) => db && db.ack(p, sent),
    onStale: () => db && db.invalidate(),
    onEvent,
  });

  /** Every progress reply (prefetch, refetch, legacy check). */
  function onReply(r: Reply): void {
    const b = r.body;
    if (r.status === 401 || (r.status === 200 && b && b.signedIn === false)) {
      if (!active) return o.account.signedOut(); // at boot: simply anonymous
      outbox.stop("revoked");
      return sessionEnded();
    }
    if (isSignedInReply(r)) {
      outbox.setPolicy(b!.policy);
      maintenance(b!.maintenance);
    } else if (b && b.code === "maintenance") maintenance(null, typeof b.message === "string" ? b.message : "");
  }

  const db = legacy
    ? null
    : createDb({
        hubId: cfg.hubId,
        lkey: cfg.lkey,
        parts: PARTS,
        storage: hook,
        transport,
        outbox,
        tabU,
        now,
        isLoggedOut: () => hook.isLoggedOut(),
        onReply,
      });
  const prefetch = db ? db.refresh(PREFETCH_TIMEOUT_MS) : null;

  /** The user's initial for the menu: cached in studyhubs.profile, else one GET /api/me. */
  function profile(publicId: string): void {
    const cached = readProfile(hook, publicId);
    if (cached) return chrome.setAccount(cached);
    void transport.request("GET", "/me").then((r) => {
      const u = r.status === 200 && r.body && r.body.signedIn === true ? r.body.user : null;
      if (!u || typeof u !== "object") return;
      writeProfile(hook, publicId, u.name || u.email);
      chrome.setAccount(readProfile(hook, publicId) || "");
    });
  }

  /** Whether use("db") hands out the DB after the prefetch (see the module comment). */
  function decide(r: Reply): boolean {
    if (isSignedInReply(r)) {
      const user = r.body!.user;
      const pid = user && typeof user.publicId === "string" && user.publicId ? user.publicId : cfg.hint;
      if (!pid || !o.account.claim(pid)) return false;
      ready = true;
      profile(pid);
      return true;
    }
    const code = r.body && r.body.code;
    if (r.status === 200 || r.status === 401 || r.timedOut || code === "maintenance") return false;
    if (r.status >= 400 && r.status < 500 && r.status !== 429) {
      warn(`progress prefetch refused (${r.status} ${String(code || "")})`);
      return false;
    }
    return !!cfg.hint && o.account.claim(cfg.hint);
  }

  async function checkLegacy(): Promise<void> {
    if (!active || outbox.dead() || now() - lastCheck < outbox.policy().refreshMs) return;
    lastCheck = now();
    const side = Number(hook.getItem(legacySidecarKey(key))) || 0;
    const r = await transport.request("GET", `/progress/${encodeURIComponent(cfg.hubId)}?known=legacy:${side}`);
    onReply(r);
    const part = isSignedInReply(r) ? r.body!.parts.legacy : null;
    if (!part || typeof part.upd !== "number") return;
    outbox.noteKnown("legacy", part.upd);
    if (!part.stub && part.upd > side) {
      chrome.showNotice({
        id: "newer",
        text: "Newer progress from another device",
        detail: "Reload to see it. Changes made here before reloading may replace it.",
        action: { label: "Reload", run: o.reload || (() => win.location.reload()) },
        tone: "warn",
      });
    }
  }

  const onVisibility = (): void => {
    if (doc.visibilityState === "hidden") return outbox.onHidden();
    outbox.retry();
    if (legacy) void checkLegacy();
  };
  const onUnload = (): void => void outbox.flush("unload");
  const onOnline = (): void => outbox.retry();
  doc.addEventListener("visibilitychange", onVisibility);
  doc.addEventListener("freeze", onUnload);
  win.addEventListener("pagehide", onUnload);
  win.addEventListener("online", onOnline);

  return {
    useDb() {
      if (!dbPromise) {
        dbPromise = prefetch
          ? prefetch.then((r) => {
              const id = win.HUB && win.HUB.id;
              if (id !== cfg.hubId) {
                warn(`window.HUB.id (${String(id)}) does not match data-hub-id (${cfg.hubId}); sync is off`);
                return null;
              }
              if (!decide(r)) return null;
              active = true;
              outbox.start();
              return db!.db;
            })
          : Promise.resolve(null);
      }
      return dbPromise;
    },
    startLegacy(known, policy, publicId) {
      if (!legacy || active) return;
      outbox.setPolicy(policy);
      if (known) outbox.noteKnown("legacy", known);
      ready = active = true;
      lastCheck = now();
      outbox.start();
      profile(publicId);
    },
    onWrite(w) {
      if (w.op !== "set") return;
      if (!legacy && w.key === cfg.lkey) {
        const rec = parseHubRecord(w.value);
        if (rec) Object.assign(tabU, rec.U);
      } else if (!legacy || w.key !== key) return;
      if (active) {
        outbox.freshen();
        outbox.arm();
      }
    },
    flushNow: () => outbox.flush("force"),
    stop: () => outbox.stop("revoked"),
    stats: () => ({
      network: transport.count() + gzipLoads,
      ready,
      active,
      fetches: db ? db.stats().fetches : 0,
      tabU: { ...tabU },
      outbox: outbox.stats(),
    }),
    dispose() {
      doc.removeEventListener("visibilitychange", onVisibility);
      doc.removeEventListener("freeze", onUnload);
      win.removeEventListener("pagehide", onUnload);
      win.removeEventListener("online", onOnline);
      outbox.dispose();
    },
  };
}
