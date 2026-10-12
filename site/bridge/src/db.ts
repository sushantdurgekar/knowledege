/**
 * The `db` and `user` capabilities in signed-in mode (build-contracts §13, spec §4.5 "DB.doc").
 *
 * The hub sees three documents (main, mocks, cards) under `progress/<part>` or
 * `data/users/<uid>/<part>`; the bridge maps them onto one server document per (user, hub):
 *  - get() answers from a cache filled by GET /api/progress/<hubId>?known=<tabU>. One shared
 *    refetch serves the hub's three sequential gets once the cache is older than
 *    policy.refreshMs (or after a `stale` acknowledgement invalidated it).
 *    The snapshot prefers, in order: another tab's newer local record (upd > tabU, the stamps
 *    THIS tab loaded or wrote; never this tab's own record, which would break the
 *    merge-on-first-sign-in), this tab's pending payload (read-your-writes), the server copy.
 *    A stub part (server not newer than known) becomes `{hub, upd}`, so the hub's own
 *    applyRemote/flush logic does the right thing; a missing part is `exists: false`.
 *  - set() validates, then hands the payload to the outbox and returns its waiter.
 */
import { buildPart, markSynced, parseHubRecord, type Part, type PartStamps, type StorageLike } from "./local-progress";
import type { Outbox, Payload } from "./outbox";
import { knownParam, type Reply, type Transport } from "./transport";
import { codedError } from "./util";

/** What the hub reads: `exists` is a boolean PROPERTY (not a method); data() returns a copy. */
export interface Snapshot {
  readonly exists: boolean;
  data(): unknown;
}

export interface DocRef {
  get(): Promise<Snapshot>;
  set(value: unknown): Promise<void>;
}

export interface HubDb {
  doc(path: string): DocRef;
}

export interface HubUser {
  id(): Promise<string>;
  isOwner(): Promise<boolean>;
}

/** use("user") when signed in: the hub then uses paths `data/users/me/<part>` (the uid never reaches it). */
export const USER: HubUser = Object.freeze({ id: async () => "me", isOwner: async () => false });

/** The only paths the hubs use: `progress/<part>` (owner) or `data/users/<uid>/<part>`. */
export const DOC_PATH_RE = /^(?:progress|data\/users\/[^/]+)\/(main|mocks|cards)$/;

/** The part named by a hub path, or null for anything else (a bug: reject invalid_argument). */
export function partFromPath(path: unknown): Part | null {
  const m = typeof path === "string" ? DOC_PATH_RE.exec(path) : null;
  return m ? (m[1] as Part) : null;
}

export function invalidPath(path: unknown): Error {
  return codedError("invalid_argument", `unsupported document path: ${String(path)}`);
}

/** Snapshot of a stored payload; data() hands out a deep copy each call. */
export function snapshotOf(payload: unknown): Snapshot {
  if (payload === undefined || payload === null) return { exists: false, data: () => undefined };
  const json = JSON.stringify(payload);
  return { exists: true, data: () => JSON.parse(json) as unknown };
}

/** A part the server holds but did not send, because it is not newer than `known`. */
export interface Stub {
  stub: true;
  upd: number;
}

/** A GET /api/progress reply for a signed-in visitor. */
export function isSignedInReply(r: Reply): boolean {
  const b = r.body;
  return r.status === 200 && !!b && b.signedIn === true && !!b.parts && typeof b.parts === "object";
}

/** The field each part's payload must carry (hub-runtime-contract §2.2). */
const SHAPE: Record<Part, string> = { main: "S", mocks: "list", cards: "map" };

export interface DbDeps {
  hubId: string;
  lkey: string;
  parts: readonly Part[];
  /** Reads and bridge-owned writes (bypassing the storage hook). */
  storage: StorageLike;
  transport: Transport;
  outbox: Outbox;
  /** Live stamps of the record this tab loaded or last wrote (updated by the storage hook). */
  tabU: PartStamps;
  now: () => number;
  isLoggedOut(): boolean;
  /** Every progress reply, applied or not (policy, maintenance, signed out, ...). */
  onReply(r: Reply): void;
}

export interface SyncDb {
  readonly db: HubDb;
  /** GET /api/progress (shared while in flight); a signed-in reply refills the cache. */
  refresh(timeoutMs?: number): Promise<Reply>;
  /** An acknowledged part: the server now holds exactly what was sent. */
  ack(part: string, sent: Payload): void;
  /** The server holds something newer: the next get() refetches. */
  invalidate(): void;
  stats(): { fetches: number; fetchedAt: number };
}

export function createDb(d: DbDeps): SyncDb {
  const cache: Partial<Record<Part, Payload | Stub | null>> = {};
  let fetchedAt = 0;
  let fetches = 0;
  let inflight: Promise<Reply> | null = null;

  const localRecord = () => parseHubRecord(d.storage.getItem(d.lkey));

  function apply(parts: Record<string, unknown>): void {
    const rec = localRecord();
    for (const p of d.parts) {
      const v = parts[p] as Payload | Stub | null;
      const remote = v && typeof v === "object" && typeof v.upd === "number" ? v : null;
      cache[p] = remote;
      if (!remote) continue;
      d.outbox.noteKnown(p, remote.upd); // also drops an older pending payload and resolves its waiters
      if (rec && rec.U[p] && remote.upd >= rec.U[p]) markSynced(d.storage, d.hubId, p, rec.U[p]);
    }
    fetchedAt = d.now();
  }

  function refresh(timeoutMs?: number): Promise<Reply> {
    if (!inflight) {
      fetches++;
      const path = `/progress/${encodeURIComponent(d.hubId)}?known=${knownParam(d.tabU, d.parts)}`;
      inflight = d.transport.request("GET", path, { timeoutMs }).then((r) => {
        inflight = null;
        if (isSignedInReply(r)) apply(r.body!.parts);
        d.onReply(r);
        return r;
      });
    }
    return inflight;
  }

  function snapshot(p: Part): Snapshot {
    let best: Payload | Stub | null | undefined = cache[p];
    const upd = (): number => (best ? best.upd : 0);
    const pend = d.outbox.pendingPart(p);
    if (pend && pend.upd > upd()) best = pend; // read-your-writes
    const rec = localRecord();
    const loc = rec && buildPart(rec, p, d.hubId);
    if (loc && loc.upd > d.tabU[p] && loc.upd > upd()) best = loc; // another tab saved newer progress
    return snapshotOf(best && (best as Stub).stub ? { hub: d.hubId, upd: best.upd } : best);
  }

  async function get(p: Part): Promise<Snapshot> {
    if (!fetchedAt || d.now() - fetchedAt >= d.outbox.policy().refreshMs) {
      if (!isSignedInReply(await refresh())) throw codedError("unavailable", "sync: progress unavailable");
    }
    return snapshot(p);
  }

  function set(p: Part, value: unknown): Promise<void> {
    if (d.isLoggedOut()) return Promise.reject(codedError("revoked", "sync: signed out"));
    const dead = d.outbox.dead();
    if (dead) return Promise.reject(codedError(dead, `sync: ${dead}`));
    const o = value as Record<string, unknown> | null;
    const body = o && typeof o === "object" ? o[SHAPE[p]] : null;
    if (!o || o.hub !== d.hubId || !Number.isSafeInteger(o.upd) || !body || typeof body !== "object") {
      return Promise.reject(codedError("invalid_argument", `sync: invalid ${p} payload`));
    }
    return d.outbox.set(p, o as unknown as Payload);
  }

  const db: HubDb = Object.freeze({
    doc(path: string): DocRef {
      const p = partFromPath(path);
      return {
        get: () => (p ? get(p) : Promise.reject(invalidPath(path))),
        set: (value: unknown) => (p ? set(p, value) : Promise.reject(invalidPath(path))),
      };
    },
  });

  return {
    db,
    refresh,
    ack(part, sent) {
      if (part in SHAPE) cache[part as Part] = sent;
    },
    invalidate() {
      fetchedAt = 0;
    },
    stats: () => ({ fetches, fetchedAt }),
  };
}
