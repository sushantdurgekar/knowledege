/**
 * A fetch stub that behaves like the M1 server's sync API (build-contracts §9–§10) for one user:
 *   GET  /api/progress/<hub>?known=…   parts as payload / {stub,upd} / null, policy, maintenance
 *   POST /api/sync                     newest wins per part (accepted / duplicate / stale), gzip accepted
 *   GET  /api/me                       {signedIn, user}
 * plus queued faults (`fail`) and held responses (`hold`) for timing tests. Every request is
 * recorded with its method, path, headers, decoded body and fetch options.
 */
import { gunzipSync } from "node:zlib";
import { vi } from "vitest";

export interface Call {
  method: string;
  path: string;
  query: string;
  headers: Record<string, string>;
  /** Parsed JSON body (decompressed when gzip). */
  body: any;
  /** Bytes on the wire. */
  wireBytes: number;
  gzip: boolean;
  keepalive: boolean;
  credentials: string | undefined;
}

export interface Fault {
  status: number;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  /** Network failure instead of a response. */
  network?: boolean;
}

type Matcher = "progress" | "sync" | "me" | "any";

export const POLICY = { tier: 1, flushMs: 120000, hiddenMinMs: 0, refreshMs: 60000, pausedUntil: null };

export interface FakeServer {
  calls: Call[];
  /** Stored payloads per hub and part. */
  store: Record<string, Record<string, any>>;
  signedIn: boolean;
  publicId: string;
  user: { name: string; email: string };
  policy: Record<string, unknown>;
  maintenance: Record<string, unknown>;
  /** The next `count` matching requests get this answer. */
  fail(on: Matcher, fault: Fault, count?: number): void;
  /** Hold matching requests until the returned release() is called (or the request aborts). */
  hold(on: Matcher): () => void;
  syncs(): Call[];
  progressGets(): Call[];
}

function headersOf(init: RequestInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  const h = (init && init.headers) || {};
  for (const [k, v] of Object.entries(h as Record<string, string>)) out[k.toLowerCase()] = String(v);
  return out;
}

function reply(status: number, body: unknown, headers: Record<string, string> = {}) {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
    json: async () => {
      if (body === undefined) throw new SyntaxError("no body");
      return JSON.parse(JSON.stringify(body));
    },
  };
}

const matches = (on: Matcher, path: string): boolean =>
  on === "any" ||
  (on === "progress" && path.startsWith("/api/progress/")) ||
  (on === "sync" && path === "/api/sync") ||
  (on === "me" && path === "/api/me");

export function fakeServer(init: Partial<Pick<FakeServer, "signedIn" | "publicId">> = {}): FakeServer {
  const faults: Array<{ on: Matcher; fault: Fault; count: number }> = [];
  const holds: Array<{ on: Matcher; release: Promise<void> }> = [];
  const server: FakeServer = {
    calls: [],
    store: {},
    signedIn: init.signedIn ?? true,
    publicId: init.publicId ?? "pub_A",
    user: { name: "Sushant", email: "s@example.test" },
    policy: { ...POLICY },
    maintenance: { mode: "off", message: "", until: null },
    fail(on, fault, count = 1) {
      faults.push({ on, fault, count });
    },
    hold(on) {
      let release!: () => void;
      const p = new Promise<void>((r) => (release = r));
      holds.push({ on, release: p });
      return release;
    },
    syncs: () => server.calls.filter((c) => c.path === "/api/sync"),
    progressGets: () => server.calls.filter((c) => c.path.startsWith("/api/progress/")),
  };

  async function handle(input: RequestInfo | URL, opts?: RequestInit) {
    const url = new URL(String(input), "https://study-hubs.test");
    const headers = headersOf(opts);
    const gzip = headers["content-encoding"] === "gzip";
    const rawBody = opts && opts.body;
    let body: any = null;
    let wireBytes = 0;
    if (rawBody != null) {
      const bytes = typeof rawBody === "string" ? Buffer.from(rawBody) : Buffer.from(rawBody as Uint8Array);
      wireBytes = bytes.length;
      body = JSON.parse((gzip ? gunzipSync(bytes) : bytes).toString("utf8"));
    }
    const call: Call = {
      method: (opts && opts.method) || "GET",
      path: url.pathname,
      query: url.search,
      headers,
      body,
      wireBytes,
      gzip,
      keepalive: !!(opts && opts.keepalive),
      credentials: opts && opts.credentials,
    };
    server.calls.push(call);

    const held = holds.find((h) => matches(h.on, call.path));
    if (held) {
      holds.splice(holds.indexOf(held), 1);
      await new Promise<void>((resolve, reject) => {
        void held.release.then(resolve);
        const signal = opts && opts.signal;
        if (signal) signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }
    const f = faults.find((x) => matches(x.on, call.path));
    if (f) {
      if (--f.count <= 0) faults.splice(faults.indexOf(f), 1);
      if (f.fault.network) throw new TypeError("Failed to fetch");
      return reply(f.fault.status, f.fault.body, f.fault.headers);
    }

    if (call.path === "/api/me") {
      return reply(200, server.signedIn ? { signedIn: true, user: { publicId: server.publicId, ...server.user } } : { signedIn: false });
    }
    // The real server's account binding (app/progress/routes.py check_account).
    const claimed = headers["x-studyhubs-account"];
    const accountRoute = call.path === "/api/sync" || call.path.startsWith("/api/progress/");
    if (accountRoute && server.signedIn && claimed !== undefined && claimed !== server.publicId) {
      return reply(409, { code: "account_changed", message: "This page belongs to another account" });
    }
    const m = /^\/api\/progress\/([^/]+)$/.exec(call.path);
    if (m && call.method === "GET") {
      if (!server.signedIn) return reply(200, { signedIn: false });
      const hub = decodeURIComponent(m[1]);
      const known: Record<string, number> = {};
      for (const item of (url.searchParams.get("known") || "").split(",")) {
        const [p, u] = item.split(":");
        if (p) known[p] = Number(u) || 0;
      }
      const stored = server.store[hub] || {};
      const parts: Record<string, unknown> = {};
      for (const p of Object.keys(known).length ? Object.keys(known) : ["main", "mocks", "cards"]) {
        const s = stored[p];
        parts[p] = !s ? null : s.upd <= (known[p] || 0) ? { stub: true, upd: s.upd } : s;
      }
      return reply(200, {
        signedIn: true,
        hub,
        user: { publicId: server.publicId },
        parts,
        policy: server.policy,
        maintenance: server.maintenance,
      });
    }
    if (call.path === "/api/sync" && call.method === "POST") {
      if (!server.signedIn) return reply(401, { code: "unauthenticated", message: "Sign in" });
      const results: Record<string, Record<string, unknown>> = {};
      for (const [hub, parts] of Object.entries((body && body.hubs) || {})) {
        const stored = (server.store[hub] = server.store[hub] || {});
        results[hub] = {};
        for (const [p, payload] of Object.entries(parts as Record<string, any>)) {
          const cur = stored[p];
          let status = "accepted";
          if (cur && cur.upd === payload.upd) status = "duplicate";
          else if (cur && cur.upd > payload.upd) status = "stale";
          else stored[p] = payload;
          results[hub][p] = { status, upd: stored[p].upd };
        }
      }
      return reply(200, { results, policy: server.policy });
    }
    return reply(404, { code: "not_found", message: "Not found" });
  }

  vi.stubGlobal("fetch", vi.fn(handle));
  return server;
}
