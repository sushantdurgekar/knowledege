/* Throwaway mock of the Study Hubs backend, for proving the bridge approach.
   Serves hub files from the vault UNCHANGED except for an injected <script src="/bridge.js"> before </head>,
   an in-memory per-user doc store, a fake cookie session, fault injection and a request log. */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

const VAULT = "/home/user/knowledege";
const HERE = __dirname;
const PORT = +process.env.PORT || 8787;

// slug -> file (the real catalog would be generated at build time)
const HUBS = {
  "dsa-l1": { file: "technical/software-engineering/dsa/hubs/dsa-l1-foundation-hub.html" },
  "dsa-l2": { file: "technical/software-engineering/dsa/hubs/dsa-l2-proficient-hub.html" },
  "ai-103": { file: "technical/certifications/ai-103/AI-103 Study Hub.html" },
  "ab-620": { file: "technical/certifications/ab-620/AB-620 Study Hub.html" },
  "ai-500": { file: "technical/certifications/ai-500/AI-500 Study Hub.html" },
  "ai-901": { file: "technical/certifications/ai-901/AI-901 Study Hub.html", legacyKeys: ["ai901hub.v1"] },
};
const PARTS = new Set(["main", "mocks", "cards", "legacy"]);
const MAX_PART = 900 * 1024;

// ---- state ----
let docs = new Map();      // `${uid}|${hub}` -> { main, mocks, cards, legacy }
let log = [];              // request log for evidence
let fail = null;           // { status, remaining, retryAfter, methods }
let maintenance = false;

function key(uid, hub) { return uid + "|" + hub; }
function getDoc(uid, hub) { const k = key(uid, hub); if (!docs.has(k)) docs.set(k, {}); return docs.get(k); }
function sessionUid(req) {
  const m = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie || "");
  return m ? decodeURIComponent(m[1]) : null;
}
function send(res, status, body, headers) {
  const isStr = typeof body === "string" || Buffer.isBuffer(body);
  const data = isStr ? body : JSON.stringify(body);
  res.writeHead(status, Object.assign({ "Content-Type": isStr ? "text/plain; charset=utf-8" : "application/json", "Cache-Control": "no-store" }, headers || {}));
  res.end(data);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => {
      let buf = Buffer.concat(chunks);
      const raw = buf.length;
      const enc = (req.headers["content-encoding"] || "").toLowerCase();
      try { if (enc === "gzip") buf = zlib.gunzipSync(buf); } catch (e) { return reject(e); }
      resolve({ text: buf.toString("utf8"), rawBytes: raw, bytes: buf.length, enc });
    });
    req.on("error", reject);
  });
}
function applyPart(uid, hub, part, payload) {
  if (!PARTS.has(part)) return { status: 400, error: "bad part" };
  if (!payload || typeof payload !== "object" || typeof payload.upd !== "number") return { status: 400, error: "bad payload" };
  const size = Buffer.byteLength(JSON.stringify(payload));
  if (size > MAX_PART) return { status: 413, error: "too large" };
  const d = getDoc(uid, hub);
  const cur = d[part];
  if (cur && (cur.upd || 0) >= payload.upd) return { status: 200, applied: false, upd: cur.upd };   // newest wins, stale write ignored
  d[part] = JSON.parse(JSON.stringify(payload));
  return { status: 200, applied: true, upd: payload.upd };
}
function injected(slug, q) {
  const h = HUBS[slug];
  const attrs = { hub: slug, download: "/download/" + slug };
  for (const k of ["mode", "flushMs", "aiv", "err429", "err503"]) if (q.get(k)) attrs[k] = q.get(k);
  if (h.legacyKeys) attrs.legacyKeys = h.legacyKeys.join(",");
  const da = Object.entries(attrs).map(([k, v]) => ` data-${k.replace(/[A-Z]/g, c => "-" + c.toLowerCase())}="${String(v).replace(/"/g, "&quot;")}"`).join("");
  let tag = `<script src="/bridge.js"${da}></script>`;
  if (h.legacyKeys) tag += `<script src="/api/legacy-seed/${slug}.js"></script>`;
  return tag;
}
function faultFor(req, pathname) {
  if (!fail) return null;
  if (!/^\/api\/(docs|sync)/.test(pathname)) return null;
  if (fail.methods && !fail.methods.includes(req.method)) return null;
  if (fail.remaining <= 0) { fail = null; return null; }
  fail.remaining--;
  return fail;
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  const p = decodeURIComponent(u.pathname);
  const uid = sessionUid(req);
  const entry = { t: Date.now(), method: req.method, path: p, uid, ka: req.headers["sec-fetch-mode"] || "" };
  const done = (status, body, headers) => { entry.status = status; if (!p.startsWith("/__test") && !p.startsWith("/hubs/") && p !== "/bridge.js") log.push(entry); send(res, status, body, headers); };
  try {
    // ---------- test controls ----------
    if (p === "/__test/reset") { docs = new Map(); log = []; fail = null; maintenance = false; return done(200, { ok: true }); }
    if (p === "/__test/log") return done(200, log);
    if (p === "/__test/docs") return done(200, Object.fromEntries(docs));
    if (p === "/__test/fail") { const b = JSON.parse((await readBody(req)).text || "{}"); fail = b.status ? { status: b.status, remaining: b.count == null ? 1e9 : b.count, retryAfter: b.retryAfter, methods: b.methods } : null; return done(200, { fail }); }
    if (p === "/__test/seed") { const b = JSON.parse((await readBody(req)).text); getDoc(b.uid, b.hub)[b.part] = b.data; return done(200, { ok: true }); }

    // ---------- pages ----------
    if (p === "/bridge.js") { return send(res, 200, fs.readFileSync(path.join(HERE, "bridge.js")), { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache" }); }
    let m;
    if ((m = /^\/hubs\/([a-z0-9-]+)$/.exec(p)) && HUBS[m[1]]) {
      const html = fs.readFileSync(path.join(VAULT, HUBS[m[1]].file), "utf8");
      let out = html;
      if (!u.searchParams.get("nobridge")) {
        // insert before the FIRST <script> anywhere (so the shim exists before any hub code), else before </head>
        const lower = html.toLowerCase();
        const cands = [lower.search(/<script[\s>]/), lower.indexOf("</head>"), lower.search(/<body[\s>]/)].filter(i => i >= 0);
        const i = cands.length ? Math.min(...cands) : -1;
        const tag = injected(m[1], u.searchParams);
        out = i >= 0 ? html.slice(0, i) + tag + html.slice(i) : tag + html;
      }
      return send(res, 200, out, { "Content-Type": "text/html; charset=utf-8" });
    }
    if ((m = /^\/download\/([a-z0-9-]+)$/.exec(p)) && HUBS[m[1]]) {
      const f = path.join(VAULT, HUBS[m[1]].file);
      const buf = fs.readFileSync(f);
      return done(200, buf, { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": `attachment; filename="${path.basename(f)}"; filename*=UTF-8''${encodeURIComponent(path.basename(f))}`, "X-Sha256": crypto.createHash("sha256").update(buf).digest("hex") });
    }
    if (p === "/vendor/fflate.umd.js") return send(res, 200, fs.readFileSync(path.join(HERE, "vendor/fflate.umd.js")), { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=31536000, immutable" });
    if (p === "/account") {
      return send(res, 200, fs.readFileSync(path.join(HERE, "account.html")), { "Content-Type": "text/html; charset=utf-8" });
    }

    // ---------- API ----------
    if (p === "/api/me") return done(200, uid ? { uid, email: uid + "@example.test", maintenance } : { uid: null });
    if (p === "/api/logout" && req.method === "POST") return done(200, { ok: true }, { "Set-Cookie": "sid=; Path=/; Max-Age=0; SameSite=Lax" });
    if ((m = /^\/api\/legacy-seed\/([a-z0-9-]+)\.js$/.exec(p)) && HUBS[m[1]]) {
      const h = HUBS[m[1]];
      let seed = { signedIn: !!uid, docs: {} };
      if (uid) { const d = getDoc(uid, m[1]); if (d.legacy) seed.docs[d.legacy.key] = { upd: d.legacy.upd, raw: d.legacy.raw }; }
      const js = `window.__studyhubsBridge&&window.__studyhubsBridge.legacySeed(${JSON.stringify(seed).replace(/</g, "\\u003c")});`;
      entry.legacySeed = { signedIn: !!uid, keys: Object.keys(seed.docs) };
      return done(200, js, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store", Vary: "Cookie" });
    }
    if (/^\/api\/(docs|sync)\//.test(p)) {
      if (!uid) return done(401, { code: "signed_out" });
      const f = faultFor(req, p);
      if (f) { entry.fault = f.status; return done(f.status, { code: f.status === 429 ? "quota" : "unavailable" }, f.retryAfter ? { "Retry-After": String(f.retryAfter) } : {}); }
    }
    // bundle read: all parts for one hub in one response (one Firestore doc read on the real backend)
    if ((m = /^\/api\/docs\/([a-z0-9-]+)$/.exec(p)) && req.method === "GET") {
      const d = getDoc(uid, m[1]);
      return done(200, { parts: { main: d.main || null, mocks: d.mocks || null, cards: d.cards || null, legacy: d.legacy || null } });
    }
    if ((m = /^\/api\/docs\/([a-z0-9-]+)\/([a-z]+)$/.exec(p))) {
      const [, hub, part] = m;
      if (req.method === "GET") { const d = getDoc(uid, hub); return done(200, d[part] ? { exists: true, data: d[part] } : { exists: false }); }
      if (req.method === "PUT") {
        const b = await readBody(req); entry.bytes = b.bytes; entry.enc = b.enc;
        let payload; try { payload = JSON.parse(b.text); } catch (e) { return done(400, { code: "bad_json" }); }
        entry.body = payload;
        const r = applyPart(uid, hub, part, payload); entry.applied = r.applied;
        return done(r.status, r);
      }
    }
    if ((m = /^\/api\/sync\/([a-z0-9-]+)$/.exec(p)) && req.method === "POST") {
      const b = await readBody(req); entry.bytes = b.bytes; entry.rawBytes = b.rawBytes; entry.enc = b.enc;
      let j; try { j = JSON.parse(b.text); } catch (e) { return done(400, { code: "bad_json" }); }
      entry.body = j;
      const results = {}; let worst = 200;
      for (const [part, payload] of Object.entries(j.parts || {})) { const r = applyPart(uid, m[1], part, payload); results[part] = r; if (r.status > worst) worst = r.status; }
      entry.results = results;
      return done(worst, { results });
    }
    return done(404, { code: "not_found" });
  } catch (e) {
    console.error(e);
    return done(500, { code: "server_error", msg: String(e) });
  }
});
server.listen(PORT, "127.0.0.1", () => console.log("mock server on http://127.0.0.1:" + PORT));
