/**
 * Transport: the bridge's only door to the network (signed-in mode only; anonymous mode never
 * creates one). Every request carries `X-StudyHubs: 1` and `credentials: "same-origin"`
 * (build-contracts §13). request() never rejects: a network failure or a timeout comes back as
 * status 0, so callers map every outcome through codeForResponse().
 */

export const API_BASE = "/api";
/** Wire-protocol header (CSRF guard on the server). */
export const PROTOCOL_HEADER = "X-StudyHubs";
export const PROTOCOL_VERSION = "1";
/**
 * The publicId of the account this page belongs to. The server answers 409 `account_changed`
 * when the session cookie is another account's (someone else signed in from another tab), so
 * nothing this page holds is ever written under, or mixed with, that account.
 */
export const ACCOUNT_HEADER = "X-StudyHubs-Account";
/** fetch keepalive bodies share a 64 KiB budget per page; stay under it. */
export const KEEPALIVE_MAX_BYTES = 60_000;
/** Lazy-load /_sh/fflate.js once the pending body passes this size. */
export const GZIP_PRELOAD_BYTES = 48 * 1024;
export const FFLATE_URL = "/_sh/fflate.js";
/** The progress prefetch (and with it use("db")/use("user")) gives up after 5 s. */
export const PREFETCH_TIMEOUT_MS = 5_000;
/** Ordinary requests give up after 30 s (mapped like a network failure). */
export const REQUEST_TIMEOUT_MS = 30_000;

/** Codes the bridge hands to a hub's set()/get() (hub-runtime-contract §2.2). */
export type HubErrorCode = "revoked" | "not_granted" | "invalid_argument" | "quota_exceeded" | "unavailable";

/**
 * Map a server answer to the hub-facing code (build-contracts §13, spec §4.5 "Error mapping").
 * `status` 0 means a network failure or timeout. Temporary failures always map to "unavailable",
 * which the hub shows as "Sync paused, saved in this browser" and retries on the next change.
 */
export function codeForResponse(status: number, serverCode?: string): HubErrorCode {
  if (status === 401 || status === 409) return "revoked"; // 409 account_changed: this page's session is gone
  if (status === 403) return "not_granted";
  if (status === 413) return "quota_exceeded";
  if (status === 422 && serverCode === "clock_skew") return "unavailable";
  if (status === 400 || status === 404 || status === 422) return "invalid_argument";
  return "unavailable"; // 429 rate_limited / sync_paused, 503 maintenance, 5xx, network, timeout
}

/** A server answer. `body` is the parsed JSON object (null when absent or unparsable). */
export interface Reply {
  status: number;
  // The wire format is validated field by field where it is used.
  body: Record<string, any> | null;
  /** When the server asked us to come back (ms since epoch), from retryAt / retryAfter / Retry-After; 0 if not given. */
  retryAt: number;
  /** True when the request was aborted by its own timeout (status is then 0). */
  timedOut?: boolean;
}

export interface RequestOptions {
  /** A JSON string, or gzip bytes (sent with Content-Encoding: gzip). */
  body?: string | Uint8Array;
  keepalive?: boolean;
  timeoutMs?: number;
  /** The page's account (publicId), sent as X-StudyHubs-Account. */
  account?: string | null;
}

export interface Transport {
  request(method: "GET" | "POST", path: string, opts?: RequestOptions): Promise<Reply>;
  /** Requests started so far (stats). */
  count(): number;
}

/** `main:<u>,mocks:<u>,cards:<u>` (the stamps this tab already holds). */
export function knownParam(stamps: object, parts: readonly string[]): string {
  return parts.map((p) => `${p}:${(stamps as Record<string, number | undefined>)[p] || 0}`).join(",");
}

/** The server's "come back at" hint as epoch ms, or 0: body `retryAt` (ISO), body `retryAfter` (s), header `Retry-After` (s or HTTP date). */
export function retryAtOf(body: Record<string, unknown> | null, header: string | null, now: number): number {
  const at = body && typeof body.retryAt === "string" ? Date.parse(body.retryAt) : NaN;
  if (at > 0) return at;
  const secs = body && typeof body.retryAfter === "number" ? body.retryAfter : header ? Number(header) : NaN;
  if (secs >= 0) return now + secs * 1000;
  const date = header ? Date.parse(header) : NaN;
  return date > 0 ? date : 0;
}

export function utf8Length(s: string): number {
  return new TextEncoder().encode(s).length;
}

export function createTransport(now: () => number = Date.now): Transport {
  let started = 0;
  return {
    count: () => started,
    async request(method, path, opts = {}) {
      started++;
      const headers: Record<string, string> = { [PROTOCOL_HEADER]: PROTOCOL_VERSION };
      if (opts.account) headers[ACCOUNT_HEADER] = opts.account;
      const init: RequestInit = { method, headers, credentials: "same-origin", cache: "no-store" };
      if (opts.body != null) {
        headers["Content-Type"] = "application/json";
        if (typeof opts.body !== "string") headers["Content-Encoding"] = "gzip";
        init.body = opts.body as BodyInit;
      }
      if (opts.keepalive) init.keepalive = true;
      const ctl = typeof AbortController === "function" ? new AbortController() : null;
      if (ctl) init.signal = ctl.signal;
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        if (ctl) ctl.abort();
      }, opts.timeoutMs || REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(API_BASE + path, init);
        let body: Reply["body"] = null;
        try {
          const parsed: unknown = await res.json();
          if (parsed && typeof parsed === "object") body = parsed as Reply["body"];
        } catch {
          /* empty or non-JSON body */
        }
        return { status: res.status, body, retryAt: retryAtOf(body, res.headers.get("Retry-After"), now()) };
      } catch {
        return { status: 0, body: null, retryAt: 0, timedOut };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** Add /_sh/fflate.js (window.__shFflate.gzipSync) to the page once; it loads in the background. */
export function loadFflate(doc: Document): void {
  if (doc.defaultView && doc.defaultView.__shFflate) return;
  if (doc.querySelector(`script[src="${FFLATE_URL}"]`)) return;
  const s = doc.createElement("script");
  s.src = FFLATE_URL;
  s.async = true;
  (doc.head || doc.documentElement).appendChild(s);
}
