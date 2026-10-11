/**
 * Boot configuration, read once from the injected script tag:
 *   <script src="/_sh/bridge.js" data-hub-id="ai103" data-slug="ai-103" data-engine="v2"
 *           [data-legacy-keys="ai901hub.v1"]></script>
 * plus the readable `sh_hint` cookie (present only for signed-in visitors).
 */
import { progressKey } from "./local-progress";

export type Engine = "v2" | "legacy" | "static";

export interface BridgeConfig {
  readonly hubId: string;
  readonly slug: string;
  readonly engine: Engine;
  /** localStorage keys of a legacy hub (AI-901: ["ai901hub.v1"]). Empty for modern hubs. */
  readonly legacyKeys: readonly string[];
  /** The modern hub's progress record key, `studyhub.<hubId>.v2` (the spec's LKEY). */
  readonly lkey: string;
  readonly origin: string;
  /** `/` — the catalog. */
  readonly catalogPath: string;
  /** `/h/<slug>` */
  readonly hubPath: string;
  /** `/h/<slug>/download` (original bytes) */
  readonly downloadPath: string;
  /** Absolute download URL; the hubs' markdown renderer links only `https?://` URLs. */
  readonly downloadUrl: string;
  /** `/signin?next=/h/<slug>` */
  readonly signInPath: string;
  /** The `sh_hint` cookie value (the user's publicId), or null for anonymous visitors. */
  readonly hint: string | null;
}

/** Minimal view of the script element: `document.currentScript` or a test double. */
export interface ScriptLike {
  readonly dataset?: DOMStringMap;
}

export interface LocationLike {
  readonly origin: string;
  readonly pathname: string;
}

export const HINT_COOKIE = "sh_hint";

/** Hub ids and slugs are short ASCII tokens (see catalog contract §3). */
const TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const HUB_PATH_RE = /^\/h\/([^/?#]+)/;

function token(value: string | undefined | null): string | null {
  const v = (value || "").trim();
  return TOKEN_RE.test(v) ? v : null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Value of cookie `name` in a `document.cookie` string, or null when absent or empty. */
export function readCookie(cookies: string, name: string): string | null {
  for (const part of (cookies || "").split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const value = safeDecode(part.slice(eq + 1).trim());
    return value || null;
  }
  return null;
}

function parseEngine(value: string | undefined): Engine {
  return value === "legacy" || value === "static" ? value : "v2";
}

function parseLegacyKeys(value: string | undefined): string[] {
  const out: string[] = [];
  for (const raw of (value || "").split(",")) {
    const k = raw.trim();
    if (k && k.length <= 200 && out.indexOf(k) < 0) out.push(k);
  }
  return out;
}

export function readConfig(
  script: ScriptLike | null | undefined,
  cookies: string,
  loc: LocationLike,
): BridgeConfig {
  const ds: DOMStringMap = (script && script.dataset) || {};
  const pathMatch = HUB_PATH_RE.exec(loc.pathname || "");
  // The server always sets data-slug/data-hub-id; the fallbacks only keep a hand-injected bridge usable.
  const slug = token(ds.slug) || token(pathMatch ? safeDecode(pathMatch[1]) : null) || "hub";
  const hubId = token(ds.hubId) || slug;
  const hubPath = `/h/${encodeURIComponent(slug)}`;
  const downloadPath = `${hubPath}/download`;
  const origin = loc.origin && loc.origin !== "null" ? loc.origin : "";
  return {
    hubId,
    slug,
    engine: parseEngine(ds.engine),
    legacyKeys: parseLegacyKeys(ds.legacyKeys),
    lkey: progressKey(hubId),
    origin,
    catalogPath: "/",
    hubPath,
    downloadPath,
    downloadUrl: origin + downloadPath,
    signInPath: `/signin?next=${hubPath}`,
    hint: readCookie(cookies, HINT_COOKIE),
  };
}
