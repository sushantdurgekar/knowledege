/* Study Hubs bridge (prototype).
   Injected by the server as the first script of every hub page:
     <script src="/bridge.js" data-hub="<slug>" data-download="/download/<slug>" [data-legacy-keys="k1,k2"]></script>
   It defines window.claude.use("db" | "user" | "sample") on top of the site API, so unmodified hub files
   get account sync when the visitor is signed in, stay in browser-only mode when anonymous, and show an
   "AI isn't supported here" dialog instead of calling a model.

   API used:  GET /api/me -> {uid|null}
              GET /api/docs/<hub> -> {parts:{main,mocks,cards,legacy}}      (one doc read per pull)
              PUT /api/docs/<hub>/<part>                                    (direct mode only)
              POST /api/sync/<hub> {parts:{...}} [Content-Encoding: gzip]   (coalesced mode) */
(function () {
  "use strict";
  if (window.__studyhubsBridge) return;

  var cs = document.currentScript, ds = (cs && cs.dataset) || {};
  var HUB = ds.hub || (location.pathname.split("/").filter(Boolean).pop() || "hub");
  var MODE = ds.mode === "direct" ? "direct" : "coalesce";
  var FLUSH_MS = Math.max(1000, +ds.flushMs || 45000);     // coalescing window
  var PULL_GAP_MS = 30000;                                   // reuse the last read for pulls closer than this
  var KEEPALIVE_MAX = 60000;                                 // fetch keepalive budget is 64 KiB per page
  var LEGACY = (ds.legacyKeys || "").split(",").filter(Boolean);
  var DL = ds.download || ("/download/" + encodeURIComponent(HUB));
  var AIV = ds.aiv || "clean";                               // prototype switch for AI rejection shapes
  var API = "/api";
  var PARTS = ["main", "mocks", "cards"];
  var CLEAR_PREFIXES = ["studyhub.", "studyhubs.", "ai901hub."];
  var MARK = "studyhubs.";                                    // bridge-owned localStorage keys
  var DIRTY_KEY = MARK + "dirty." + HUB;
  var ls = null; try { ls = window.localStorage; } catch (e) { ls = null; }
  var rawSet = Storage.prototype.setItem, rawRemove = Storage.prototype.removeItem;

  var stats = { puts: 0, posts: 0, gets: 0, errors: 0, lastErr: null, flushes: [] };
  var loggedOut = false;

  function err(code, msg, extra) { var e = new Error(msg || code); e.code = code; if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; }); return e; }
  function codeFor(status) {
    if (status === 401 || status === 403) return "not_granted";          // hub drops to browser-only mode for this page
    if (status === 413) return "quota_exceeded";                         // hub toasts "Account storage is full"
    if (status === 400 || status === 422) return "invalid_argument";
    if (status === 429 && ds.err429) return ds.err429;                   // prototype override for comparison runs
    if (status === 503 && ds.err503) return ds.err503;
    return "unavailable";                                                // 429 / 5xx / network: "Sync paused, saved in this browser"
  }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function lsGet(k) { try { return ls ? ls.getItem(k) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { if (ls) rawSet.call(ls, k, v); } catch (e) { } }
  function lsDel(k) { try { if (ls) rawRemove.call(ls, k); } catch (e) { } }
  function retryAfterMs(r, fallback) { var s = r && r.headers && r.headers.get("Retry-After"); var n = s ? parseInt(s, 10) : NaN; return isFinite(n) ? n * 1000 : fallback; }

  /* ---------------- session ---------------- */
  var meP = null, ME = null;
  function me() {
    if (!meP) meP = fetch(API + "/me", { credentials: "same-origin", cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { ME = j && j.uid ? j : null; return ME; })
      .catch(function () { return null; });
    return meP;
  }

  /* ---------------- reads (one request serves the hub's three sequential part reads) ---------------- */
  var known = {};            // last server upd seen per part
  var bundle = null, bundleAt = 0, bundleP = null;
  function fetchBundle() {
    if (bundle && Date.now() - bundleAt < PULL_GAP_MS) return Promise.resolve(bundle);
    if (bundleP) return bundleP;
    stats.gets++;
    bundleP = fetch(API + "/docs/" + encodeURIComponent(HUB), { credentials: "same-origin", cache: "no-store" })
      .then(function (r) {
        if (!r.ok) { if (r.status === 401) signedOut(); throw err(codeFor(r.status), "HTTP " + r.status, { status: r.status }); }
        return r.json();
      })
      .then(function (j) {
        bundle = j.parts || {}; bundleAt = Date.now();
        Object.keys(bundle).forEach(function (p) { if (bundle[p]) known[p] = Math.max(known[p] || 0, bundle[p].upd || 0); });
        ready = true;
        return bundle;
      }, function (e) { if (!e.code) e = err("unavailable", String(e)); throw e; })
      .then(function (b) { bundleP = null; return b; }, function (e) { bundleP = null; throw e; });
    return bundleP;
  }
  function snapOf(d) { var c = clone(d); return { exists: !!d, data: function () { return clone(c); } }; }

  /* ---------------- writes ---------------- */
  var ready = false;         // true once the server state is known (safe to mirror local -> server)
  var active = false;        // true once the hub obtained the db (signed in, account mode)
  var pending = {};          // part -> payload waiting for the next flush
  var timer = null, inflight = null, again = false, retryAt = 0, lastErr = null, backoff = 0;

  function setDirtyMark() {
    var ps = Object.keys(pending);
    if (ps.length) lsSet(DIRTY_KEY, JSON.stringify({ parts: ps, since: Date.now() })); else lsDel(DIRTY_KEY);
  }
  function queue(part, payload) {
    var cur = pending[part];
    if (cur && (cur.upd || 0) > (payload.upd || 0)) return;
    if (!cur && (known[part] || 0) >= (payload.upd || 0)) return;   // server already has this or newer
    pending[part] = payload; setDirtyMark(); schedule();
  }
  function schedule(ms) {
    if (timer || loggedOut) return;
    var wait = ms != null ? ms : Math.max(FLUSH_MS, retryAt - Date.now());
    timer = setTimeout(function () { timer = null; flush(false); }, wait);
  }
  /* Build payloads straight from the hub's own localStorage record, so the newest state is sent even if the
     hub's 1.2 s debounce has not fired yet (e.g. answer, then close the tab). Mirrors the hub's payload(). */
  function hubRecord() {
    var id = window.HUB && window.HUB.id; if (!id) return null;
    try { var o = JSON.parse(lsGet("studyhub." + id + ".v2") || "null"); return o && o.U ? { id: id, o: o } : null; } catch (e) { return null; }
  }
  function localPart(p) {
    var rec = hubRecord(); if (!rec) return null;
    var o = rec.o, U = o.U; if (!U[p]) return null;
    if (p === "main") return { hub: rec.id, upd: U.main, S: o.S };
    if (p === "mocks") return { hub: rec.id, upd: U.mocks, list: (o.MOCKS || []).slice(-25) };
    return { hub: rec.id, upd: U.cards, map: o.CARDS || {} };
  }
  function freshen() {
    if (!active || !ready) return;
    PARTS.forEach(function (p) {
      var have = Math.max(known[p] || 0, pending[p] ? pending[p].upd || 0 : 0);
      var loc = localPart(p);
      if (loc && (loc.upd || 0) > have) pending[p] = loc;
    });
    setDirtyMark();
  }

  var gz = null; // { src, blob } pre-compressed copy of the current pending body for unload sends
  var gzTimer = null, gzLib = false, lastUnloadSrc = null;
  var GZIP_LIB = ds.gzipLib || "/vendor/fflate.umd.js";      // sync gzip, lazy-loaded only for big states
  function loadGzipLib() {
    if (gzLib || window.fflate) return; gzLib = true;
    var sc = document.createElement("script"); sc.src = GZIP_LIB; sc.async = true; (document.head || document.documentElement).appendChild(sc);
  }
  function body() {
    var parts = {}, n = 0;
    Object.keys(pending).forEach(function (p) { parts[p] = pending[p]; n++; });
    return n ? JSON.stringify({ parts: parts }) : null;
  }
  function byteLen(s) { return new Blob([s]).size; }
  function prepGz() {
    clearTimeout(gzTimer);
    gzTimer = setTimeout(function () {
      var src = body(); if (!src || byteLen(src) <= KEEPALIVE_MAX) return;
      loadGzipLib();
      if (typeof CompressionStream !== "function") return;
      new Response(new Blob([src]).stream().pipeThrough(new CompressionStream("gzip"))).blob()
        .then(function (blob) { gz = { src: src, blob: blob }; }).catch(function () { });
    }, 300);
  }

  function flush(unloading) {
    if (loggedOut || MODE !== "coalesce") return Promise.resolve();
    freshen();
    var src = body();
    if (!src) { setDirtyMark(); return Promise.resolve(); }
    if (!unloading && Date.now() < retryAt) { schedule(retryAt - Date.now()); return Promise.resolve(); }
    if (inflight && !unloading) { again = true; return inflight; }
    if (unloading && src === lastUnloadSrc) return Promise.resolve();   // pagehide + visibilitychange both fire on unload
    if (unloading) lastUnloadSrc = src;
    var sent = {}; Object.keys(pending).forEach(function (p) { sent[p] = pending[p]; });
    var headers = { "Content-Type": "application/json" };
    var opts = { method: "POST", credentials: "same-origin", headers: headers, body: src };
    var size = byteLen(src), how = "plain";
    if (unloading) {
      if (size <= KEEPALIVE_MAX) { opts.keepalive = true; how = "keepalive"; }
      else if (window.fflate && window.fflate.gzipSync) {
        var z = window.fflate.gzipSync(window.fflate.strToU8(src));
        if (z.length <= KEEPALIVE_MAX) { opts.keepalive = true; opts.body = new Blob([z]); headers["Content-Encoding"] = "gzip"; how = "keepalive-gzip-sync"; }
        else how = "too-big-for-keepalive";
      }
      else if (gz && gz.blob.size <= KEEPALIVE_MAX) {
        opts.keepalive = true; opts.body = gz.blob; headers["Content-Encoding"] = "gzip"; how = "keepalive-gzip";
        if (gz.src !== src) how += "-stale";   // a few hundred ms old; the dirty mark makes the next load re-push
      } else how = "too-big-for-keepalive";
    }
    stats.posts++; stats.flushes.push({ at: Date.now(), parts: Object.keys(sent), bytes: size, how: how });
    var p = fetch(API + "/sync/" + encodeURIComponent(HUB), opts).then(function (r) {
      if (!r.ok) {
        if (r.status === 401) { signedOut(); throw err("not_granted", "HTTP 401", { status: 401 }); }
        var e = err(codeFor(r.status), "HTTP " + r.status, { status: r.status });
        backoff = Math.min(backoff ? backoff * 2 : 15000, 600000);
        retryAt = Date.now() + retryAfterMs(r, backoff);
        throw e;
      }
      return r.json().catch(function () { return {}; });
    }).then(function (j) {
      var res = (j && j.results) || {};
      Object.keys(sent).forEach(function (part) {
        known[part] = Math.max(known[part] || 0, sent[part].upd || 0, (res[part] && res[part].upd) || 0);
        if (bundle) bundle[part] = (res[part] && res[part].applied === false) ? bundle[part] : sent[part];
        if (pending[part] === sent[part]) delete pending[part];
      });
      lastErr = null; backoff = 0; retryAt = 0; setDirtyMark();
    }).catch(function (e) {
      if (!e.code) { e = err("unavailable", String(e)); backoff = Math.min(backoff ? backoff * 2 : 15000, 600000); retryAt = Date.now() + backoff; }
      lastErr = e; stats.errors++; stats.lastErr = e.code;
      if (!loggedOut && e.code !== "not_granted") schedule();
    }).then(function () {
      inflight = null;
      if (again) { again = false; if (Object.keys(pending).length) schedule(); }
    });
    if (!unloading) inflight = p;
    return p;
  }

  function signedOut() { active = false; }

  /* ---------------- the db object handed to the hub ---------------- */
  function partOf(path) { return String(path || "").split("/").pop(); }
  var DB = {
    doc: function (path) {
      var part = partOf(path);
      return {
        get: function () {
          if (PARTS.indexOf(part) < 0) return Promise.reject(err("invalid_argument", "unknown part " + part));
          active = true;
          return fetchBundle().then(function (b) {
            var d = b[part] || null, buf = pending[part];
            if (buf && (!d || (buf.upd || 0) > (d.upd || 0))) d = buf;            // read-your-writes
            else if (buf) { delete pending[part]; setDirtyMark(); }               // server has newer: drop stale buffer
            // another tab of this hub saved newer progress than this tab holds in memory: hand it over
            var loc = ready && ownU ? localPart(part) : null;
            if (loc && (loc.upd || 0) > (ownU[part] || 0) && (!d || (loc.upd || 0) > (d.upd || 0))) d = loc;
            return snapOf(d);
          });
        },
        set: function (data) {
          if (PARTS.indexOf(part) < 0) return Promise.reject(err("invalid_argument", "unknown part " + part));
          if (loggedOut) return Promise.reject(err("revoked", "signed out"));
          active = true;
          if (MODE === "direct") {
            stats.puts++;
            return fetch(API + "/docs/" + encodeURIComponent(HUB) + "/" + part, { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
              .then(function (r) {
                if (!r.ok) { var e = err(codeFor(r.status), "HTTP " + r.status, { status: r.status }); stats.errors++; stats.lastErr = e.code; throw e; }
                known[part] = Math.max(known[part] || 0, data.upd || 0);
                if (bundle) bundle[part] = clone(data);
              }, function (e) { stats.errors++; stats.lastErr = "unavailable"; throw err("unavailable", String(e)); });
          }
          queue(part, clone(data)); prepGz();
          if (lastErr) return Promise.reject(lastErr);   // surface "Sync paused" in the hub pill until a flush succeeds
          return Promise.resolve();
        }
      };
    }
  };

  function userObj(u) {
    return { id: function () { return Promise.resolve(u.uid); }, isOwner: function () { return Promise.resolve(false); }, name: function () { return Promise.resolve(u.name || null); } };
  }

  /* ---------------- AI: not supported on the site ---------------- */
  var AI_MSG = "AI isn't supported here. Download this hub and use it in your own AI provider for Ask-AI features.";
  var overlayHost = null;
  function showOverlay() {
    if (overlayHost) { overlayHost.style.display = "block"; var b0 = overlayHost.shadowRoot.querySelector("a"); if (b0) b0.focus(); return; }
    overlayHost = document.createElement("div");
    overlayHost.id = "studyhubs-ai-overlay";
    var root = overlayHost.attachShadow({ mode: "open" });
    root.innerHTML =
      '<style>' +
      ':host{all:initial}' +
      '.bk{position:fixed;inset:0;background:rgba(10,14,20,.55);display:flex;align-items:center;justify-content:center;z-index:2147483647;padding:16px;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}' +
      '.dlg{background:#fff;color:#141a22;max-width:440px;width:100%;border-radius:12px;padding:22px 22px 18px;box-shadow:0 18px 50px rgba(0,0,0,.35)}' +
      'h2{font-size:18px;margin:0 0 8px}p{margin:0 0 16px}.row{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}' +
      'a,button{font:inherit;border-radius:8px;padding:9px 14px;cursor:pointer;text-decoration:none;border:1px solid #c9d2de;background:#fff;color:#141a22}' +
      'a{background:#2343c4;border-color:#2343c4;color:#fff}' +
      '@media (prefers-color-scheme:dark){.dlg{background:#18202b;color:#e3eaf2}button{background:#18202b;color:#e3eaf2;border-color:#3a4757}a{background:#8fa4ff;border-color:#8fa4ff;color:#0c1117}}' +
      '</style>' +
      '<div class="bk" part="backdrop"><div class="dlg" role="dialog" aria-modal="true" aria-labelledby="t" aria-describedby="d">' +
      '<h2 id="t">AI isn’t supported here</h2>' +
      '<p id="d">Download this hub and use it in your own AI provider for Ask-AI features. Everything else on this page works without AI.</p>' +
      '<div class="row"><button type="button" data-close>Close</button><a data-dl download href="' + DL + '">Download this hub</a></div>' +
      '</div></div>';
    var close = function () { overlayHost.style.display = "none"; };
    root.querySelector("[data-close]").addEventListener("click", close);
    root.querySelector("[data-dl]").addEventListener("click", function () { setTimeout(close, 0); });
    root.querySelector(".bk").addEventListener("click", function (e) { if (e.target === e.currentTarget) close(); });
    overlayHost.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    document.body.appendChild(overlayHost);
    root.querySelector("[data-dl]").focus();
  }
  function aiStub() {
    showOverlay();
    if (AIV === "plain") return Promise.reject(new Error("AI not supported"));
    if (AIV === "notgranted") return Promise.reject(err("not_granted"));
    var link = location.origin + DL;
    return Promise.reject(err("cancelled", AI_MSG, { text: "**AI isn't supported here.** [Download this hub](" + link + ") and use it in your own AI provider for Ask-AI features." }));
  }
  aiStub.json = function () {
    showOverlay();
    if (AIV === "plain") return Promise.reject(new Error("AI not supported"));
    if (AIV === "notgranted") return Promise.reject(err("not_granted"));
    if (AIV === "cancelled-json") return Promise.reject(err("cancelled", AI_MSG));
    return Promise.resolve(null);   // aiJSON clears its "Thinking…" and every caller treats null as "nothing to show"
  };

  /* ---------------- window.claude shim ---------------- */
  window.claude = window.claude || {};
  window.claude.use = function (name) {
    if (name === "db") return me().then(function (u) { return u ? DB : null; });
    if (name === "user") return me().then(function (u) { return u ? userObj(u) : null; });
    if (name === "sample") return Promise.resolve(aiStub);
    return Promise.reject(err("not_declared", "capability " + name + " is not available"));
  };

  /* ---------------- localStorage hooks: legacy mirroring, instant freshen, logout guard ---------------- */
  var legacySignedIn = false;
  var ownU = null;           // U of the last hub record THIS tab wrote (other tabs' writes show up as a newer U)
  function isHubKey(k) { k = String(k); for (var i = 0; i < CLEAR_PREFIXES.length; i++) if (k.indexOf(CLEAR_PREFIXES[i]) === 0) return true; return LEGACY.indexOf(k) >= 0; }
  Storage.prototype.setItem = function (k, v) {
    if (this === ls && loggedOut && isHubKey(k)) return;           // a dying tab must not re-save the previous user's progress
    rawSet.call(this, k, v);
    if (this !== ls) return;
    k = String(k);
    if (LEGACY.indexOf(k) >= 0) {
      var upd = Date.now();
      rawSet.call(this, MARK + "legacy." + k + ".upd", String(upd));
      if (legacySignedIn) { pending.legacy = { hub: HUB, key: k, upd: upd, raw: String(v) }; setDirtyMark(); schedule(); prepGz(); }
    } else if (window.HUB && k === "studyhub." + window.HUB.id + ".v2") {
      try { var rec = JSON.parse(v); if (rec && rec.U) ownU = rec.U; } catch (e) { }
      if (MODE === "coalesce" && active && ready) { freshen(); if (Object.keys(pending).length) { schedule(); prepGz(); } }
    }
  };

  function legacySeed(seed) {
    // runs synchronously, before the legacy hub's own script reads localStorage
    legacySignedIn = !!(seed && seed.signedIn);
    if (!legacySignedIn) return;
    active = true; ready = true;
    LEGACY.forEach(function (k) {
      var r = seed.docs && seed.docs[k];
      var localRaw = lsGet(k);
      var localUpd = +(lsGet(MARK + "legacy." + k + ".upd") || 0) || (localRaw ? 1 : 0);
      if (r && (r.upd || 0) > localUpd) {
        lsSet(k, r.raw); lsSet(MARK + "legacy." + k + ".upd", String(r.upd)); known.legacy = r.upd;
      } else if (localRaw && (!r || localUpd > (r.upd || 0))) {
        known.legacy = r ? r.upd : 0;
        pending.legacy = { hub: HUB, key: k, upd: localUpd > 1 ? localUpd : Date.now(), raw: localRaw };
        setDirtyMark(); schedule(1500);                       // merge-on-first-login for the legacy hub
      } else if (r) known.legacy = r.upd;
    });
  }

  function clearLocal() {
    if (!ls) return 0;
    var del = [];
    for (var i = 0; i < ls.length; i++) { var k = ls.key(i); if (isHubKey(k)) del.push(k); }
    del.forEach(lsDel);
    return del.length;
  }

  /* ---------------- lifecycle ---------------- */
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flush(true); });
  window.addEventListener("pagehide", function () { flush(true); });
  try {
    var bc = new BroadcastChannel("studyhubs");
    bc.onmessage = function (ev) {
      var m = ev.data || {};
      if (m.type === "flush") flush(true);
      if (m.type === "logout") { loggedOut = true; clearTimeout(timer); pending = {}; clearLocal(); location.reload(); }
    };
  } catch (e) { }

  window.__studyhubsBridge = {
    version: "proto-1", hub: HUB, mode: MODE, stats: stats,
    flushNow: function () { return flush(false); },
    legacySeed: legacySeed, clearLocal: clearLocal,
    pending: function () { return clone(pending); }, known: function () { return clone(known); }
  };
})();
