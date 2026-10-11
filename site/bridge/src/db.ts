/**
 * The `db` and `user` capabilities.
 *
 * M0 is anonymous-only: both resolve null (in a microtask, so the hub's
 * `Promise.all([use("db"), use("user")])` settles before first paint and the pill stays
 * "Saved in this browser"). A visitor with the `sh_hint` cookie also gets null in M0.
 *
 * TODO(M1): signed-in mode (spec §4.5):
 *  - resolveDb: when signed in, engine "v2" and no owner mismatch, await the progress prefetch
 *    (5 s timeout → null), require window.HUB.id === cfg.hubId, claim `studyhubs.owner`, and
 *    return a HubDb whose doc(path).get()/set() serve the hub's three parts from one document.
 *  - resolveUser: `{id: async () => "me", isOwner: async () => false}`.
 */
import type { BridgeConfig } from "./config";
import type { Part } from "./local-progress";
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

export interface Session {
  readonly cfg: BridgeConfig;
  /** M0: always false. */
  readonly signedIn: boolean;
}

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

export function resolveDb(session: Session): Promise<HubDb | null> {
  void session; // TODO(M1): signed-in path (see module comment).
  return Promise.resolve(null);
}

export function resolveUser(session: Session): Promise<HubUser | null> {
  void session; // TODO(M1): signed-in path (see module comment).
  return Promise.resolve(null);
}
