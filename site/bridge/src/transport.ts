/**
 * Transport: the bridge's only door to the network (M1).
 *
 * Nothing in M0 imports a request function from here: anonymous mode makes zero requests.
 * This module holds the wire constants and the error mapping so M1 can add the calls.
 *
 * TODO(M1):
 *  - getProgress(hubId, known) → GET /api/progress/<hubId>?known=main:<u>,mocks:<u>,cards:<u> (5 s timeout)
 *  - sync(body, {unloading}) → POST /api/sync with `X-StudyHubs: 1`, credentials same-origin,
 *    keepalive / gzip choice made by the outbox.
 */

export const API_BASE = "/api";
/** Wire-protocol header; the server accepts version N and N−1. */
export const PROTOCOL_HEADER = "X-StudyHubs";
export const PROTOCOL_VERSION = "1";
/** fetch keepalive bodies share a 64 KiB budget per page; stay under it. */
export const KEEPALIVE_MAX_BYTES = 60_000;
/** Lazy-load /_sh/fflate.js once the pending body passes this size. */
export const GZIP_PRELOAD_BYTES = 48 * 1024;
export const FFLATE_URL = "/_sh/fflate.js";

/** Codes the bridge hands to a hub's set()/get() (hub-runtime-contract §2.2). */
export type HubErrorCode = "revoked" | "not_granted" | "invalid_argument" | "quota_exceeded" | "unavailable";

/**
 * Map a server answer to the hub-facing code (spec §4.5 "Error mapping"). `status` 0 means a
 * network failure or timeout. Temporary failures always map to "unavailable", which the hub
 * shows as "Sync paused, saved in this browser" and retries on the next change.
 */
export function codeForResponse(status: number, serverCode?: string): HubErrorCode {
  if (status === 401) return "revoked";
  if (status === 403) return "not_granted";
  if (status === 413) return "quota_exceeded";
  if (status === 422 && serverCode === "clock_skew") return "unavailable";
  if (status === 400 || status === 404 || status === 422) return "invalid_argument";
  return "unavailable"; // 429 rate_limited / sync_paused, 503 maintenance, 5xx, network, timeout
}
