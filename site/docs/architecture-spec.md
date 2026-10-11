# Chief-architect verdict: Study Hubs website

## 0. Verdict

The base is **DESIGN MVP**. It has a single process, coalesces writes only in the bridge, and treats the browser's localStorage as the durable write buffer. That matches what the live prototype proved, and it is the only one of the three designs that can be built in a few sessions. It has eight defects where it contradicts the probe facts or leaves a data-integrity gap. Each is fixed below with a graft from the prototype, DESIGN OPS or DESIGN INTEGRITY.

I rejected two whole subsystems:
- DESIGN OPS's server write-behind buffer, because it acknowledges writes before they are committed and adds RAM and restart risk for no gain in durability.
- DESIGN INTEGRITY's conflict-copy, IndexedDB, stash and eviction machinery. It is correct, but it costs too much for v1 and goes to the backlog.

## 1. Extra verification run for this review

Both checks used headless Chromium with Playwright 1.56 against the real hub files. No repo file was modified.

1. **Hash-based script CSP works on every hub.**
   - **Setup.** I served each hub with the prototype bridge injected before `</head>`. The headers were `script-src 'self' <sha256 of each inline script>` (no `'unsafe-inline'`), `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`, `default-src 'none'` and `connect-src 'self'`.
   - **Result.** I clicked through 6–11 tabs per hub and called the AI shim, which opens the shadow-DOM modal. Every hub had zero `securitypolicyviolation` events, zero page errors and zero console errors: DSA L1, DSA L3, AB-620, AI-500, AI-103 (3 hashes) and AI-901 (7 hashes). `has-ai` stayed on for the engine hubs.
   - **Consequence.** DESIGN MVP's decision to defer hash CSP is unnecessary. Hash CSP ships from M0.
2. **Holding `set()` until the server acknowledges works, and is better than the prototype's resolve-on-queue.** This applies only when the bridge rebuilds payloads from localStorage at flush time. I patched a copy of the prototype bridge so that `set()` returns a promise settled by the flush result, then ran it on DSA L1 and AI-103:

   | Scenario | Result |
   |---|---|
   | 10 answers 1.5 s apart, 10 s window | 2 POSTs, the same count as the prototype, so holding does not double writes. Server equals local. |
   | Leave the page about 0.2 s after an answer | Server has the latest. |
   | One injected 503 | The pill flips to "Sync paused" when the flush fails; the prototype only flipped it on the next touch. The bridge's background retry stores the latest. The pill stays "paused" until the next touch, so the bridge's cosmetic pill rewrite is worth keeping. |

## 2. Scores (1–10)

| Criterion | MVP | INTEGRITY | OPS |
|---|---|---|---|
| Correctness vs hub contract and probe facts | 6 | 6 | 7 |
| Meets every owner decision in the brief | 9 | 8 | 8 |
| Free-tier fitness (Firestore W/R/egress; Render RAM, egress, sleep) | 7 | 6 | 8 |
| Data integrity and security | 6 | 9 | 6 |
| Simplicity / implementable in a few sessions | 9 | 3 | 5 |
| AWS portability | 8 | 8 | 8 |
| **Total (of 60)** | **45** | **40** | **42** |

### MVP
**Strengths**
- Smallest moving-part count.
- The browser is the buffer.
- One doc per (user, hub).
- Sync route handlers run in the threadpool.
- Strong backup and restore job design, with the checkpoint committed atomically with each batch.
- Email/password accounts get no session until the address is verified.
- Thorough milestone plan.

**Defects**
1. Before a daily 429 quota error it returns `quota_exceeded`, which shows the wrong toast "Account storage is full".
2. `AI.json` rejects, so the hub shows "Stopped.".
3. The AI text has no absolute link.
4. It holds `set()` until flush but never rebuilds the payload from localStorage. The pending payload is the *first* one in the window, so `pagehide` sends stale data and the last answers before the hub's 1.2 s debounce are lost. The prototype's gotcha 4 describes this.
5. The hidden-tab flush is rate-capped at 60 s, but on mobile the hidden event is often the last signal before the tab dies.
6. Bodies over 60 KB on unload fall back to a plain fetch. Heavy cert-hub state is 50–60 KB or more.
7. Legacy sync polls and then reloads, which can clobber a save the hub made before the reload. The verified seed-script method avoids this.
8. Writes are blind (no server newest-wins guard) except in `if_newer` mode.
9. Script CSP uses `'unsafe-inline'`.
10. Data goes in a subcollection with map fields. That makes backups cost extra reads, and whether map subfields inherit index exemptions is unverified.

### INTEGRITY
**Strengths**
- Server-enforced `decide()`.
- Two-phase `known` read.
- Owner tag (I5).
- Maintenance modes `read_only` and `full`.
- STREAM AEAD backup format.
- Flat composite-id collection.
- Hash CSP.
- Tombstones.

**Defects**
- `AI.json` is the same function as `sample`, so it rejects and shows "Stopped.".
- 401 maps to `unavailable` instead of the probe's `revoked`.
- An unknown `use()` name resolves `null` instead of rejecting `not_declared`.
- The bridge URL is hashed and carries SRI. Every deploy then changes every hub's bytes and ETag, so users re-download about 142 KB per hub.
- The synthetic `visibilitychange` nudge triggers `rerenderAll()`, which wipes unsaved inputs.
- Same stale-first-payload outbox flaw as MVP.
- `pagehide` drops parts that do not fit in 60 KiB instead of gzipping them.
- The 60 s base window uses about twice the writes.
- Scope is far too large: IndexedDB preserve store, stash, eviction, conflicts UI, client-log and CSP-report endpoints, a relay iframe, leases, an audit log, and three-browser e2e.

### OPS
**Strengths**
- The verified AI shape (`AI.json` resolves `null`).
- The probe's error mapping.
- Injection before `</head>`.
- Brotli plus gzip precompression.
- Stable bridge URL.
- Quota-tier policy pushed to the bridge.
- Egress guard.
- `publicId` HMAC.
- The best capacity model.

**Defects**
- The server write-behind buffer marks a part "Synced" before it is committed. It loses data on OOM or kill, and makes deploy overlap harder.
- The four-layer store stack and the LRU cache.
- Legacy hydration is an async fetch followed by a reload, with a race against hub `save()`.
- The outbox-only `pagehide` loses the last 1.2 s of answers.
- The AI text has no absolute link.
- GHCR image deploys are the default path, but Render free support for them is unverified.

## 3. Synthesis

### 3.1 Base: MVP, because
- It already matches the prototype's architecture: bridge-only coalescing, one doc per (user, hub) and per-part newest-wins.
- It has no server state that the browser does not already hold durably.
- Its backup, restore and scheduler skeleton is sound and store-neutral.

### 3.2 Grafts (exact)
**From the verified prototype (`proto/bridge.js`)**
- G1. Rebuild payloads at flush time from `localStorage["studyhub.<id>.v2"]` (`freshen`), driven by a `Storage.prototype.setItem` hook. This includes `MOCKS.slice(-25)` and is gated by `ready && active`.
- G2. Track `ownU`/`tabU`, and in `get()` hand over another tab's newer local record. Never hand over this tab's own record.
- G3. Unload path:
  - Deduplicate `pagehide` and `visibilitychange(hidden)` by body.
  - Use `keepalive` when the body is ≤ 60,000 B.
  - Otherwise use lazy-loaded fflate 0.8.2 `gzipSync`, falling back to a precomputed `CompressionStream` blob.
  - The server decodes gzip with a bounded size.
- G4. Legacy: a blocking per-user seed script, a `setItem` wrapper filtered to `this === localStorage && key ∈ legacyKeys`, and sidecar timestamps kept for anonymous visitors too.
- G5. Logout sequence:
  1. Broadcast `flush`.
  2. Wait.
  3. `POST logout`.
  4. Clear the key prefixes.
  5. Broadcast `logout`, and hub tabs reload.

  The `setItem` hook drops hub-key writes after logout.
- G6. Status codes: anonymous gets 200 `{signedIn:false}`, and missing docs get 200 with `null` parts. Never return a 4xx for these, because Chrome logs every 4xx as a console error.

**From OPS**
- G7. A tier policy sent by the server (flush and refresh windows set by the fraction of the daily write budget used), delivered in every progress response.
- G8. Brotli-11 plus gzip-9 precompression at build time, and a stable, unhashed bridge URL with a short `max-age`.
- G9. A Render egress meter plus guard tiers.
- G10. `publicId = HMAC(SECRET_KEY, uid)`, used in the readable hint cookie and the owner tag. The raw uid never reaches hub JavaScript.
- G11. A Node collector with `vm` metadata extraction. A failing hub is skipped and listed in `build-report.json`; `--strict` in CI turns that red.
- G12. Merge many hubs at sign-in or logout in one request (a single `/api/sync` endpoint takes any number of hubs).
- G13. Flat top-level Firestore fields (`p_main`, `u_main`, …), so no index exemption depends on map-subfield inheritance.
- G14. Admin "migration triggers" and the Firestore-restore preset "after next quota reset".

**From INTEGRITY**
- G15. Per-hub `sha256` script CSP, which I verified above.
- G16. A pure `decide()` used by every adapter: accepted, duplicate or stale, plus a clock-skew bound. The server always enforces newest-wins.
- G17. Two-phase GET with `?known=`, which returns stub parts when the server is not newer.
- G18. Maintenance `off | read_only | full`, and a `consistent` flag on backups.
- G19. Owner tag and account-mismatch block. A logout dialog appears when progress is dirty, with an option to download it.
- G20. Flat `progress/{uid}~{hubId}` with doc-id range queries, tombstones, and STREAM AEAD framing with a last-frame flag. Validation stages a decrypted copy, so the midnight job never needs the passphrase.
- G21. A runtime check that `window.HUB.id === data-hub-id`.

### 3.3 Rejected (and why)
- OPS server write-behind and LRU cache: the ack comes before the commit, it adds RAM and crash loss, and it makes Render deploy overlap harder. The browser already holds newer state.
- INTEGRITY conflict copies, IndexedDB preserve store, account stash, automatic localStorage eviction, `client-log`/`csp-report` endpoints, `HUB_ORIGIN` relay iframe, and the `update_time` precondition fast path. These go to the backlog. The fast path is the first lever if reads go above 60%.
- Synthetic `visibilitychange` nudges: they trigger `rerenderAll()`, which wipes inputs.
- Double-submit CSRF tokens: a custom header plus an Origin check plus `SameSite=Lax` with no CORS is sufficient.
- Hashed bridge URL with SRI: costs egress.
- Self-hosted fonts: Google Fonts costs zero Render egress.
- Three-browser e2e: Chromium plus a WebKit mobile smoke test is enough.
- GHCR image deploys as the default: unverified on Render free. CI gates deploys with Render's deploy hook instead.
- Pre-seeding engine hubs with a blocking script: it would add a blocking request to every anonymous hub load. The probe shows a late `use("db")` is safe. Revisit only if reports of `rerenderAll()` wiping inputs appear.

### 3.4 Flaws and contradictions to fix

| # | Where | Flaw | Fix |
|---|---|---|---|
| F1 | MVP §3 | A daily-quota 429 maps to `quota_exceeded`, so the hub toasts "Account storage is full". | `quota_exceeded` is used **only** for 413 (per-user size cap). Daily quota, maintenance, 5xx and network errors map to `unavailable`. |
| F2 | MVP, INTEGRITY | `AI.json` rejects, so the hub shows "Stopped.". | `AI.json` opens the modal and resolves `null` (verified clean). |
| F3 | MVP, OPS | The AI rejection text has no link. | `text: "**AI isn't supported here.** [Download this hub](" + location.origin + "/h/<slug>/download) and use it in your own AI provider for Ask-AI features."` `mdBlock` links only absolute `https?://` URLs. |
| F4 | MVP, INTEGRITY, OPS | The outbox holds the payload from the hub's last `set()`. While the hub is busy (held promise) or debouncing (1.2 s), newer state exists only in localStorage, so unload sends stale data. | G1: `freshen()` before every flush and on every own-tab write to the LKEY. |
| F5 | MVP | The hidden-tab flush is capped at 60 s. | Tier 1: flush on hidden whenever dirty. Tier ≥ 2: only if ≥ 60 s since the last success. Always flush on `pagehide` and `freeze`. |
| F6 | MVP, INTEGRITY | Unload bodies over 60 KB are dropped or sent without keepalive. | G3 (fflate `gzipSync`). |
| F7 | MVP, OPS | Legacy sync reloads after an async fetch and can race the hub's `save()`. | G4 seed script, which runs before AI-901's parse-time read (verified). Mid-session remote changes show a "Reload" banner, never an automatic reload. |
| F8 | MVP | Blind writes in normal mode. | G16: every PUT runs a transaction that reads `u_*` and writes only the accepted parts. |
| F9 | MVP | `script-src 'unsafe-inline'` on hubs. | G15. CI fails on any `securitypolicyviolation`. |
| F10 | MVP | Subcollection layout and map-field exemptions. | G13 + G20: flat collection, flat fields, with every field exemption listed explicitly. |
| F11 | MVP | The bridge is injected before the first `<script`. | Inject before the first `</head>` (present exactly once in all 7 files). Fall back to the first `<script`, otherwise mark the hub `static`. Never use a whole-file regex: AI-500 contains `<base />` text inside JS strings. |
| F12 | MVP | `/api/me` and the progress GET are two serial requests on hub load. | One `GET /api/progress/{hubId}` returns the user, policy, maintenance state and parts. |
| F13 | INTEGRITY | 401 maps to `unavailable`. An unknown `use()` name maps to `null`. | 401 maps to `revoked`, plus a chrome banner. An unknown name rejects `not_declared`. |
| F14 | INTEGRITY | Hashed bridge URL with SRI. | Stable `/_sh/bridge.js` with `max-age=600, stale-while-revalidate=86400` and an ETag. Wire protocol versioned with the `X-StudyHubs: 1` header; the server accepts N and N−1. |
| F15 | OPS | Write-behind gives "Synced" before commit. | Remove it. A waiter resolves only after the store commits. |
| F16 | All | Account switch: user A's session expires, user B signs in, and the hub's `pullRemote` flushes A's local "newer" data into B's account. MVP handles this only in the shell. | G19. The bridge checks the owner tag synchronously at boot; on a mismatch `use("db")` resolves `null` and the chrome links to `/account` to resolve it. The shell wipes A's data at sign-in after a dialog if it is dirty. |
| F17 | All | The probe's 5 s settle rule. | `use("db")` and `use("user")` wait for the prefetch with a 5 s cap, then resolve `null`. `use("sample")` resolves immediately, which avoids the double `bindTutor` edge case. |
| F18 | MVP, OPS | Clock-skew bounds of +24 h and +7 d let a fast device win conflicts for a day. | Reject `upd > now + 15 min` with 422 `clock_skew`. The bridge maps it to `unavailable` and shows a "Your device clock is ahead" banner. |
| F19 | MVP | Python `hashlib.scrypt` with N=2^15, r=8 needs 32 MiB plus overhead, which is above the default `maxmem` and raises an error. | Use `cryptography`'s `Scrypt` KDF (or pass `maxmem=64 MiB`). |
| F20 | All | Vault `.gitignore` collisions (`build/`, `dist/`, `*.gz`, `*.png`, `*.bin`, `*.db`, `secrets.*`, `credentials*.json`, `.env.*`). | No `secrets.py` and no directory named `build` inside the source tree. Generate test fixtures at runtime rather than committing `.gz` files. Use an SVG favicon. All output goes to `site/build/`, which is already ignored. |
| F21 | All | The AI modal wording. The downloaded file's AI works only inside a Claude artifact (prototype gotcha 10). | Keep the owner's sentence and add "(for example, upload it to Claude and open it as an artifact)" and "Your progress on this site isn't included in the file." |
| F22 | INTEGRITY | The waiter rejects on the first failed attempt but the outbox is not told to keep the payload. | On failure, keep the pending payload (G-retry), reject current waiters with the mapped code, and resolve later waiters on the eventual success. This was verified in check 2. |

## 4. Consolidated architecture

### 4.1 System on one screen
```
Browser ─HTTPS─> FastAPI/uvicorn, 1 worker, 1 instance ──gRPC──> Firestore (default, Standard, Spark)   [Render now]
  │               /h/<slug>             precompressed hub + 1 injected <script src="/_sh/bridge.js">
  │               /h/<slug>/download    original bytes (attachment)
  │               /api/seed/<id>.js     legacy hubs only (per-user, no-store)
  │               /, /signin, /account, /admin…   React SPA (Vite build in public/)
  │               /api/*                session-cookie auth, progress, account, admin
  │               asyncio scheduler     jobs, meter flush, quota rollover           ──SQL──> Postgres  [AWS later]
  └─ Firebase JS SDK (shell auth routes only, inMemoryPersistence) ─> Firebase Auth (Google + email/password)
```

**Invariants**
- Hub bytes are untouched apart from one injected line. The download serves the exact original.
- Anonymous hub views make **zero** `/api` calls.
- The server never stores an older `upd` over a newer one.
- No acknowledgement before the commit.
- Quota limits and maintenance degrade to "saved in this browser" with automatic retry.
- No cross-account data flow.
- No private vault file enters the build context or the image.

**Capacity**
- Writes:
  - Tier 1 (< 50% of the budget) uses about 24 writes per 40-minute session.
  - Tier 2 uses about 12.
  - Tier 3 uses about 5.
  - That gives **about 1,500 signed-in sessions per day** within 19,000 progress writes.
- Reads come to about the number of writes plus 2–8 per session, which stays under 50k.
- Render egress is the first limit for anonymous traffic: about 30k uncached hub loads per month at about 142 KB brotli. That is the reason for Cloudflare plus a custom domain (see 4.15).

### 4.2 Repo layout
```
.dockerignore                       # repo root (Docker reads it from the context root); allow-list
.github/workflows/site.yml          # repo root (GitHub requirement)
site/
  README.md                         # dev, deploy, env reference, Firebase checklist, link to RUNBOOK
  hubs.config.json                  # include globs, legacy map, per-hub overrides, lintAllow
  publish-denylist.txt
  Dockerfile  render.yaml  Makefile
  bridge/                           # TypeScript -> esbuild -> one IIFE (ES2019), budget <= 14 KB gz
    package.json  build.mjs
    src/index.ts         boot, config, window.claude, use()
    src/db.ts            doc/get/set, known/tabU, snapshot cache, handover
    src/outbox.ts        pending, waiters, tier timers, backoff, flush, unload
    src/transport.ts     fetch, X-StudyHubs header, error->code map, gzip
    src/legacy.ts        seed, setItem wrapper, sidecars
    src/auth-events.ts   owner tag, BroadcastChannel, logout guard
    src/ai.ts            AI shim + modal
    src/chrome.ts        floating closed-shadow-DOM menu and banners
    src/local-progress.ts   SHARED with client: keys, payload builders, dirty calc, wipe, summaries
    vendor/fflate.min.js    (0.8.2, MIT; served as /_sh/fflate.js)
    test/*.test.ts       vitest + jsdom
  client/                           # React + Vite + TS + react-router (exact versions pinned at scaffold)
    index.html vite.config.ts tsconfig.json package.json
    public/favicon.svg public/robots.txt
    src/main.tsx App.tsx api.ts me.tsx firebase.ts
    src/pages/{Catalog,SignIn,SignUp,Reset,Verify,SignOut,Account,Privacy,NotFound}.tsx
    src/pages/admin/{Overview,Backup,Restore,Maintenance,Settings}.tsx
    src/styles/{tokens.css,app.css}
  scripts/
    collect-hubs.mjs     discover -> inspect -> validate -> inject -> CSP hashes -> precompress -> catalog
    verify-context.mjs   fails if the copied tree has anything outside the hub allow-list
    check-image.sh       lists the image; fails on .md/_meta/sessions/practice/work or unexpected hubs/ files
    backup_tool.py       offline inspect | verify | decrypt (imports server/app/backup)
    dev_pg.sh            initdb + pg_ctl on a temp Unix socket, port 54329
  server/
    pyproject.toml  requirements.txt (pip-compile --generate-hashes)  requirements-dev.txt
    app/main.py config.py errors.py logging_setup.py catalog.py hubs_routes.py static_routes.py
    app/auth/{firebase.py,session.py,deps.py,csrf.py}
    app/progress/{validate.py,decide.py,service.py,routes.py,seed.py}
    app/store/{base.py,firestore.py,postgres.py,memory.py,factory.py,sql/0001_init.sql}
    app/quota/{pacific.py,meter.py,guard.py,policy.py,egress.py}
    app/backup/{format.py,crypto.py,writer.py,reader.py,uploads.py,restore.py}
    app/jobs/{scheduler.py,maintenance.py}
    app/admin/{routes.py,stats.py}  app/account/routes.py
    app/testing/routes.py           # mounted only when APP_ENV=test
    tests/{unit,contract,api}/ conftest.py
  e2e/ playwright.config.ts  tests/*.spec.ts   # ports proto s123..s910 + new scenarios
  firebase/ firebase.json firestore.rules firestore.indexes.json .firebaserc.example
  deploy/aws/ compose.yaml Caddyfile .env.example backup-cron.sh RUNBOOK.md
```

**Conventions**
- Folders and non-code files use kebab-case. Python modules are snake_case, which the vault's code-repo exception covers.
- Commits use `chore(site): …`, following the vault's type list.
- Follow-up outside `site/`: exclude `site/` from `_meta/tools/build_index.py`.

### 4.3 Catalog build and injection (`collect-hubs.mjs`, Node 22, standard library plus parse5-free regex, validated by CI)
1. **Discover.** The globs come from `hubs.config.json` and are mirrored exactly in `.dockerignore`; a unit test asserts the two lists are equal:
   - `technical/*/*/hubs/*-hub.html`
   - `technical/certifications/*/*Study Hub.html`

   Reject any path containing the segments `courses|projects|examples|datasets|media|docs|notes|snippets|work|_meta|sessions|practice`.
2. **Inspect.** Hash the raw bytes. Extract inline scripts with `/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi`, skipping any with `src`; this matched the browser in my CSP check.
   - **Metadata:** run the data scripts in `vm.createContext` with `var window=globalThis`, a 3 s timeout, and stop at the script that contains `const H = window.HUB` or starts with `(function (`. Read `HUB.id, title, code, cert, hero.title, modules.length` and `--accent`.
   - **Legacy:** the id and keys come from the config map. Today that is `{"technical/certifications/ai-901/AI-901 Study Hub.html": {"id":"ai901","keys":["ai901hub.v1"]}}`. Count modules with the `M.push({` regex and take the title from `<title>`.
3. **Engine.**
   - `v2` requires all of these probes: `window.HUB`, `window.claude.use("db")`, `window.claude.use("user")`, `.doc(SYNC.base + "/" + part)`, `snap.exists` and `"studyhub." + H.id + ".v2"`.
   - `legacy` comes from the config map.
   - Anything else is `static`: served, local-only, with a warning.
4. **Derive.**
   - `slug`: lowercase the stem, turn spaces into `-`, strip a trailing `-hub` or `-study-hub`. Results: `dsa-l1-foundation`, `ab-620`, `ai-103`, `ai-500`, `ai-901`. An override can change it.
   - `level` and `levelLabel` come from `-l([1-4])-(\w+)`; cert hubs get `kind:"cert"`.
   - `domain` and `subject` come from the path.
5. **Validate.**
   - `id` matches `^[a-z0-9][a-z0-9-]{1,40}$`; ids and slugs are unique; slugs avoid the reserved words `admin api assets _sh h signin account`.
   - Publish lint (errors unless `lintAllow` covers them): email addresses, `(?i)gain ?insights`, `AKIA[0-9A-Z]{16}`, `AIza[0-9A-Za-z_-]{35}`, `sk-ant-`, `-----BEGIN [A-Z ]*PRIVATE KEY-----`.
   - A failing hub is left out and listed in `build-report.json`. `--strict` (CI) exits non-zero.
6. **Inject.** Insert immediately before the first `</head>` (case-insensitive). Fall back to before the first `<script`, otherwise mark the hub `static`. Never add `<base>`.
   ```html
   <script src="/_sh/bridge.js" data-hub-id="ai103" data-slug="ai-103" data-engine="v2"></script>
   ```
   Legacy hubs get one more tag right after it:
   ```html
   <script src="/_sh/bridge.js" data-hub-id="ai901" data-slug="ai-901" data-engine="legacy" data-legacy-keys="ai901hub.v1"></script><script src="/api/seed/ai901.js"></script>
   ```
   **Assertion:** the served file with the injected span removed equals the original byte for byte.
7. **Outputs** in `out/`:
   - `hubs/<slug>/index.html.{br,gz}` (served variant)
   - `hubs/<slug>/original.html{,.br,.gz}`
   - `catalog.internal.json` (with `source`, `csp`)
   - `catalog.json{,.br,.gz}` (public subset)
   - `build-report.json`

   Public catalog entry:
   ```json
   {"id":"ai103","slug":"ai-103","title":"AI-103 Study Hub","code":"AI-103","kind":"cert","level":null,"levelLabel":null,
    "domain":"certifications","subject":"ai-103","cert":"Microsoft Certified: Azure AI Apps and Agents Developer Associate",
    "blurb":"Become an Azure AI apps and agents developer","modules":37,"accent":"#2343c4","engine":"v2",
    "storageKeys":["studyhub.ai103.v2","studyhub.ai103.mockrun"],"legacyKeys":[],
    "downloadName":"AI-103 Study Hub.html","bytes":802992,"brBytes":201778,"sha256":"…"}
   ```

### 4.4 Hub serving and headers
| Path | Response | Cache |
|---|---|---|
| `/h/{slug}` | Precompressed served variant (br > gz > gunzip on the fly). `/h/{slug}/` redirects 301; an old slug or an id redirects 301; an unknown slug gets a 404 page. | `public, max-age=300, stale-while-revalidate=86400`, strong ETag per encoding, `Vary: Accept-Encoding` |
| `/h/{slug}/download` | Original bytes, `Content-Disposition: attachment; filename="AI-103 Study Hub.html"; filename*=UTF-8''AI-103%20Study%20Hub.html`, `Content-Security-Policy: sandbox` | `public, max-age=3600`, ETag = sha256 |
| `/_sh/bridge.js`, `/_sh/fflate.js` | Precompressed | `public, max-age=600, stale-while-revalidate=86400`, ETag |
| `/assets/*` | Vite hashed assets | `immutable`, 1 year |
| `/catalog.json` | Public catalog | `max-age=300, swr=86400` |
| SPA routes | `index.html` | `no-cache` |
| `/api/*` | JSON | `private, no-store` (GZipMiddleware, compresslevel 5, ≥ 1 KB) |
| `/healthz` | `{"ok":true}`, no DB | `no-store` |
| `/readyz` | Store ping, cached for 10 minutes (≤ 144 reads/day) | `no-store` |
| `/robots.txt` | `Disallow: /api/`, `/h/*/download`, `/admin` | |

Hub pages are served as top-level documents; the three designs and both probes agree, and `#hash` deep links are kept.

**Hub CSP** (header, per hub):
```
default-src 'none'; script-src 'self' 'sha256-…' …; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none';
frame-ancestors 'none'; object-src 'none'
```
Also sent: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Cross-Origin-Opener-Policy: same-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and HSTS.

### 4.5 Bridge spec
**Boot.** The bridge is a synchronous classic script and the first script on the page.
1. Read `document.currentScript.dataset`: `hubId`, `slug`, `engine` and `legacyKeys`. `LKEY = "studyhub." + hubId + ".v2"`.
2. Read `hint = cookie sh_hint` (the `publicId`, or absent) and `owner = localStorage["studyhubs.owner"]`. Set `mismatch = hint && owner && owner !== hint`.
3. `tabU` = the `U` value of the LKEY record (what the hub is about to load).
4. Install the `Storage.prototype.setItem` and `removeItem` wrapper. It calls the original first and rethrows its error.
   - If `QuotaExceededError` is thrown on a hub key, show the chrome banner "Browser storage is full" linking to `/account#storage`.
   - After logout, drop writes to hub keys.
   - On this tab's own LKEY write, set `tabU = rec.U`, then `freshen()` and `arm()` if `ready && active`.
   - On a legacy-key write, set the sidecar `studyhubs.legacy.<key>.upd = Date.now()`; if signed in, queue part `legacy`.
5. Start the prefetch only when `hint && !mismatch && engine==="v2"`:
   `GET /api/progress/<hubId>?known=main:<tabU.main>,mocks:<…>,cards:<…>`, with a 5 s timeout.
6. Define `window.claude = Object.freeze({use})` and `window.__studyhubsBridge = {legacySeed, flushNow, stats, version}`.
7. Add listeners: `visibilitychange`, `pagehide`, `freeze`, `online` and `BroadcastChannel("studyhubs")`. Mount the chrome on `DOMContentLoaded`.

**Capability map**
| Call | Anonymous / mismatch / static / timeout / maintenance `full` / `signedIn:false` | Signed in |
|---|---|---|
| `use("db")` | `null` (resolves in microtasks when there is no hint) | `DB`, after the prefetch is applied, with `ready=true` |
| `use("user")` | `null` | `{id: async () => "me", isOwner: async () => false}` |
| `use("sample")` | `AI` shim, resolved immediately | same |
| other names | reject `{code:"not_declared"}` | same |

Before resolving `DB`, the bridge requires `window.HUB.id === hubId`; otherwise it resolves `null` and logs a diagnostic. If `owner` is absent it sets `owner = publicId` (first sign-in claims the anonymous data). After the snapshot, for each part where `remote.upd ≥ local U`, it sets `studyhubs.synced.<hubId>[p] = local U`.

**`DB.doc(path)`**
- The path must match `^(progress|data/users/[^/]+)/(main|mocks|cards)$`. The part is the last segment and the prefix is ignored. Anything else rejects `invalid_argument` (bugs only).
- `get()` returns a snapshot built from the cache. When the cache is older than `policy.refreshMs`, one shared refetch serves the three sequential gets, sending `known=tabU`.
  - **Read-your-writes:** a newer pending payload wins.
  - **Stale pending:** if the cached `upd` is newer than the pending one, drop the pending part and resolve its waiters.
  - **Handover:** if the local record (written by another tab) has `upd > tabU[p]` and is newer than the remote, use it.
  - The result is `{exists: <boolean property>, data: () => deepCopy}`. A stub part becomes `data: () => ({hub, upd})`, and the hub's own `applyRemote` and flush logic then do the right thing. A missing part becomes `{exists:false, data:()=>undefined}`.
- `set(obj)` checks, in order:
  1. If logged out, reject `revoked`. If the bridge is dead, reject with the dead code.
  2. If `obj.hub !== hubId` or `upd` is not a safe integer, reject `invalid_argument`.
  3. If `obj.upd ≤ max(acked[p], known[p])`, resolve immediately.
  4. Otherwise call `freshen()`, set pending, call `arm()`, and return a **waiter** that resolves when a flush carrying an `upd ≥ obj.upd` is acknowledged.

**Flush policy.** The server sends `policy = {tier, flushMs, hiddenMinMs, refreshMs, pausedUntil}` with every progress response.

| Tier (writes used ÷ budget B) | flushMs (anchored at the first unsent change) | hidden flush | refreshMs |
|---|---|---|---|
| 1 (< 0.5) | 120 s | whenever dirty | 60 s |
| 2 (0.5–0.8) | 300 s | if ≥ 60 s since the last success | 120 s |
| 3 (0.8–1.0) | 900 s | if ≥ 60 s | 300 s |
| paused (≥ 1.0) | the server answers 429 `sync_paused` with `retryAt` | — | 300 s |

Rules that apply on every tier:
- `pagehide` and `freeze` always flush if dirty.
- A `flush` broadcast (logout) flushes now.
- `online`, and the tab becoming visible after a failure, retry once `retryAt` has passed.
- At most one request is in flight, carrying all dirty parts. The body is `{"hubs":{"<hubId>":{"main":{…},"cards":{…}}}}`.
- **Unload:** deduplicate by body; use `keepalive` when ≤ 60,000 B; otherwise use fflate `gzipSync` (lazy-loaded once the pending body passes 48 KB), then a precomputed `CompressionStream` blob, then a plain fetch.

**Acknowledgement**
- **`accepted` or `duplicate`:** set `acked[p] = known[p] = upd`, update `studyhubs.synced.<hubId>`, set `cache[p] = sent`, and resolve waiters.
- **`stale`:** set `known[p] = stored upd`, drop the pending part if it is older, set `fetchedAt = 0` (the next real visibility pull adopts the remote), and resolve waiters. No synthetic events.
- After a background success, if `#syncPill` has class `mid`, rewrite it to the hub's own cloud markup `<span class="dot"></span>Synced to your account` with `class="pill ok"`. This is cosmetic and guarded.

**Error mapping** (server result → code given to the hub → bridge action)

| Server | Hub code | Bridge |
|---|---|---|
| 401 `unauthenticated` | `revoked` | Stop the outbox; banner "Session ended — sign in to sync"; keep local data |
| 403 `forbidden` / `csrf` / `account_mismatch` | `not_granted` | Stop; diagnostic |
| 400/404/422 `invalid` | `invalid_argument` | Stop (contract bug) |
| 422 `clock_skew` | `unavailable` | Keep pending; banner; retry every 10 minutes |
| 413 `too_large` (per-part or per-doc cap) | `quota_exceeded` (the hub's toast is accurate) | Drop that part's pending payload; banner |
| 429 `rate_limited` | `unavailable` | Honour `Retry-After` |
| 429 `sync_paused` (budget, `ResourceExhausted`, per-user cap) | `unavailable` | Hold until `retryAt` plus 0–10 minutes jitter; banner "Cloud sync resumes at 12:30 IST" |
| 503 `maintenance` | `unavailable` | Banner with `until` |
| 5xx, network, timeout | `unavailable` | Back off from 15 s, doubling to a 10-minute cap |
| any `get()` failure | rejects `unavailable` | The hub shows "Sync paused" |

The bridge never returns `not_granted`, `sampling_disabled` or `capability_*` from AI calls, and never returns `invalid_argument` or `capability_*` for temporary failures.

**AI shim**

`AI(input, opts)`:
- Opens the modal (one at a time; repeat calls are ignored while it is open).
- Returns `Promise.reject(Object.assign(new Error("ai_unsupported"), {code:"cancelled", text: MSG_MD}))`.
- Never calls `onText` and ignores `signal`.

`AI.json(input, opts)`:
- Opens the modal and returns `Promise.resolve(null)`.

The modal:
- Closed shadow root with `z-index: 2147483647`, `role="dialog"`, `aria-modal`, Esc to close, focus trap and focus restore.
- Title: "AI isn't supported here".
- Body: "Download this hub and use it in your own AI provider for Ask-AI features (for example, upload it to Claude and open it as an artifact). Your progress on this site isn't included in the file."
- Buttons: **Download this hub** (`<a download href="/h/<slug>/download">`) and **Close**.

Resolving `{text}` for chat input was rejected, because the hub would add a "Written by Claude…" footer under it.

**Legacy (AI-901)**
- `/api/seed/ai901.js` runs before line 868 and calls `__studyhubsBridge.legacySeed({signedIn, publicId, policy, parts:{legacy:{upd, raw}}|{}})`. Anonymous visitors get a tiny response with no DB read.
- When signed in:
  - If `remote.upd > sidecar`, write `raw` with the original `setItem`.
  - Else if local exists and is newer, queue `legacy = {hub:"ai901", upd, key, raw}` (merge at first sign-in).
- Mid-session: when the tab becomes visible again after more than `refreshMs`, the bridge GETs with `known=legacy:<sidecar>`. If the remote is newer, it shows a banner "Newer progress from another device — Reload". It never reloads automatically.
- Watch `mistakes` growth: the per-part cap of 128 KiB gzipped returns 413 and the banner.

**Auth events** on `BroadcastChannel("studyhubs")`:
- `flush`: flush now.
- `auth-changed`: hidden hub tabs reload; visible tabs show "Signed in — reload to sync" and reload on the next visibility change unless `studyhub.<id>.mockrun` exists.
- `logout`: set `loggedOut`, wipe keys, `location.reload()`.

**Chrome.** A 36 px pill at bottom-left (bottom-centre from 861 px, clear of the hubs' sticky Learn rail; build-contracts.md §6), safe-area padded, hidden in print, in a closed shadow DOM that follows the hub's `data-theme` and `prefers-color-scheme`. It holds:
- ← All hubs
- Sign in, or the user's initial with a menu: Account, Sign out (which goes to `/signout`)
- Download this hub
- Notices: maintenance, upcoming window, sync paused, session ended, clock skew, account mismatch, storage full, and a dismissible "Progress is saved only in this browser — sign in to keep it" for anonymous users after their first progress.

**Keys the bridge owns**
- `studyhubs.owner`
- `studyhubs.synced.<id>`
- `studyhubs.legacy.<key>.upd`
- `studyhubs.ui.*` (kept on logout)

Site code never uses the `studyhub.` or `ai901hub.` prefixes.

### 4.6 Auth and session
1. The shell uses the Firebase JS SDK, lazy-loaded on the auth, account and admin routes only, with `initializeAuth(app, {persistence: inMemoryPersistence, popupRedirectResolver: browserPopupRedirectResolver})`.
   - Google: `signInWithPopup`.
   - Email: `signInWithEmailAndPassword`.
   - Sign-up: `createUserWithEmailAndPassword` + `updateProfile` + `sendEmailVerification(user, {url: origin + "/verify"})`.
   - Reset: `sendPasswordResetEmail`, with a 60 s cooldown and generic messages.
   - No email-link sign-in and no redirect flow.
2. `POST /api/auth/session {idToken}` with `X-StudyHubs: 1`. The server:
   - Calls `verify_id_token(check_revoked=True, clock_skew_seconds=10)`.
   - Requires `now − auth_time ≤ 300 s`.
   - Requires `email_verified` (Google accounts are verified). Password accounts get **no session until verified** (403 `email_unverified`, with a resend button).
   - Upserts the user (1 write; `lastLoginAt` at most once per 24 h; deferred in maintenance).
   - Calls `create_session_cookie(idToken, 14 days)`.
   - Sets the cookies below.

   | Cookie | Flags | Value |
   |---|---|---|
   | `__Host-sh_session` | HttpOnly, Secure, SameSite=Lax, Path=/, Max-Age 1209600 | session cookie |
   | `sh_hint` | readable, Secure, Lax | `publicId` |

   Then the client calls `signOut(auth)`.
3. On each request, `verify_session_cookie(check_revoked=False)` runs locally and the result is cached for 5 minutes per cookie hash. Admin routes and `DELETE /api/me` use `check_revoked=True`. An invalid cookie clears both cookies.
4. **CSRF.** Every non-GET `/api/*` request needs `X-StudyHubs: 1` and `Origin == PUBLIC_ORIGIN` (or `Sec-Fetch-Site: same-origin` when Origin is absent). There is no CORS. `fetch(…, {keepalive:true})` carries the header (same origin).
5. **Admin.** The email must be in `ADMIN_EMAILS`, `email_verified` must be true, `firebase.sign_in_provider == "google.com"`, and `check_revoked=True`; optionally the uid must also be in `ADMIN_UIDS`. Backup creation, restore apply and replace, entering `full` maintenance and `DELETE /api/me` also need `X-Reauth: <ID token>` with `auth_time ≤ 300 s` and the same uid.
6. **Sign-in flow in the shell:**
   1. Create the session.
   2. Compare the owner tag. If it differs and there is local hub data, compute dirty parts (`U > synced`). If any are dirty, show [Download it as a file] [Discard and continue], then wipe.
   3. Run `reconcileUp` and set `owner = publicId`. `reconcileUp` sends one `POST /api/sync` with every hub's parts where `U > synced`, batched at ≤ 1 MiB per request and gzipped with `CompressionStream`.
   4. Broadcast `auth-changed`.
   5. `location.assign(next)`, where `next` must match `^/(h/[a-z0-9-]+)?$` or a known SPA route.
7. **Logout** (`/signout` page):
   1. Broadcast `flush` and wait 1 s.
   2. `reconcileUp`.
   3. If any part is still dirty, show [Try again] [Download unsynced progress (.json)] [Sign out anyway].
   4. `POST /api/auth/logout`.
   5. Wipe `studyhub.*.v2`, `studyhub.*.mockrun`, legacy keys and `studyhubs.*` except `studyhubs.ui.*`. Keep `studyhub.codeLang`.
   6. Broadcast `logout` and navigate to `/`.

   An expired session clears nothing.

### 4.7 API spec
| Method and path | Auth | Request → response (reads/writes) |
|---|---|---|
| `GET /api/config` | – | `{firebase:{apiKey,authDomain,projectId,appId}, origin, version}` |
| `GET /api/me` | optional | `{signedIn, user:{publicId,email,name,photo,provider,admin}, maintenance:{mode,message,until}, upcoming, policy}` (0 reads) |
| `POST /api/auth/session` | – (10/min/IP) | `{idToken}` → `{user}`. Errors: 401 `invalid_token`, 403 `email_unverified`, 403 `stale_login`, 503 `maintenance` (only when mode is `full`) |
| `POST /api/auth/logout` | cookie | 204, clears cookies |
| `GET /api/progress/{hubId}?known=main:<upd>,mocks:<upd>,cards:<upd>[,legacy:<upd>]` | optional | 200 `{signedIn:true, hub, user:{publicId}, parts:{main:{…payload…}\|{"stub":true,"upd":n}\|null,…}, policy, maintenance}`. Anonymous or invalid session: 200 `{signedIn:false}` and cookies cleared. Maintenance `full`: 503. Cost: 1 read if unchanged, 2 if changed. |
| `POST /api/sync` | user | Body `{"hubs":{"<hubId>":{"<part>":payload}}}` (≤ 25 hubs; ≤ 2 MiB on the wire; gzip accepted, decompressed size capped at 8 MiB) → 200 `{"results":{"<hubId>":{"<part>":{"status":"accepted\|duplicate\|stale\|rejected","upd":n,"code"?:"too_large\|invalid"}}},"policy":{…}}`. Cost: 1 read + (0 or 1) write per hub. Request-level errors: 401, 403, 422 `clock_skew`, 429 (`rate_limited`, `sync_paused` + `retryAt`), 503 `maintenance`. |
| `GET /api/seed/{hubId}.js` | optional | JavaScript, `no-store`, `Vary: Cookie` (1 read when signed in, 0 when anonymous) |
| `GET /api/me/progress` | user | `{"hubs":[{"hub","slug","title","parts":{"main":{"upd","bytes"}},"done":12}]}` (1 read per doc: id-range query with field mask) |
| `GET /api/me/export` | user | JSON attachment of every decoded part |
| `DELETE /api/me` | user + `X-Reauth`, `{confirm:"DELETE"}` | Deletes progress docs, user doc and Auth user; writes a tombstone; clears cookies → 204 |
| `GET /api/admin/stats` | admin | Meters, see 4.9 |
| `GET/PUT /api/admin/maintenance` | admin (+reauth for `full`) | `{mode:"off\|read_only\|full", message, until}` |
| `GET/PUT /api/admin/settings` | admin | `{tz:"Asia/Kolkata", notice}` (optimistic `version`) |
| `GET /api/admin/backups/estimate` | admin | `{users, docs, estReads, readsLeftToday, fits, suggestAfter}` |
| `POST /api/admin/backups` | admin + reauth | `{passphrase:null\|"…", requireReadOnly:true}` → `{ticket, filename, expiresIn:120}`. Returns 409 if the estimated reads exceed today's remaining reads minus a 20% reserve. |
| `GET /api/admin/backups/{ticket}` | admin cookie, single-use | Streamed `.backup` (`application/octet-stream`, `no-store`) |
| `GET /api/admin/backups/log` | admin | `[{at, bytes, fileSha256, counts, encrypted, consistent}]` |
| `POST /api/admin/restore/uploads` | admin | `{name, size, lastModified}` → `{uploadId, chunkSize:4194304, received:[]}` |
| `PUT /api/admin/restore/uploads/{id}/chunks/{n}` | admin | Raw body ≤ 4 MiB, `X-Chunk-SHA256` → `{n, ok}` (idempotent) |
| `GET /api/admin/restore/uploads/{id}` | admin | `{state:"uploading\|assembled\|validating\|validated\|invalid", received, report}` |
| `POST /api/admin/restore/uploads/{id}/validate` | admin + reauth | `{passphrase?}` → 202; poll GET |
| `DELETE /api/admin/restore/uploads/{id}` | admin | Wipes staging |
| `POST /api/admin/jobs` | admin + reauth | Restore: `{kind:"restore", uploadId, mode:"merge"\|"replace", runAt:"now"\|"tonight"\|"after_quota_reset"\|ISO, tz, exitMaintenanceOnSuccess:true, confirm:"REPLACE 143 USERS"?}`. Maintenance window: `{kind:"maintenance", mode, startAt, tz, durationMin, message}` → job |
| `GET /api/admin/jobs`, `GET /api/admin/jobs/{id}`, `POST /api/admin/jobs/{id}/cancel` | admin | State, progress `{done,total}`, checkpoint, report |
| `POST /api/test/session`, `/api/test/faults`, `/api/test/clock` | only when `APP_ENV=test` | Tests |

All errors use one shape, `{"code":"…","message":"…","retryAfter":n}`, with a `Retry-After` header on 429 and 503.

**Payload validation**
- `hubId` must be in the catalog. Allowed parts: `v2` → main, mocks, cards; `legacy` → legacy.
- `payload.hub == hubId` (legacy: `hub == id`).
- `upd` is an integer with `1.6e12 ≤ upd ≤ now + 15 min`.
- Shapes:
  - main: `S` is an object
  - mocks: `list` is an array (≤ 40)
  - cards: `map` is an object
  - legacy: `key ∈ legacyKeys` and `raw` is a string that parses as a JSON object
- Store `gzip(json.dumps(payload, separators=(",",":"), ensure_ascii=False))`.
- Limits: ≤ 128 KiB gzipped per part, ≤ 384 KiB per doc.
- `done` = count of truthy entries in `S.done` (legacy: `done` from the parsed raw value).

**Rate limits** (in-memory token buckets):

| Route | Limit |
|---|---|
| `/api/sync` | 12/min, burst 6, and `USER_WRITES_PER_DAY=300` per uid (over the cap: 429 `sync_paused` until the PT reset) |
| `GET /api/progress` | 60/min |
| seed | 60/min |
| `/api/me/export` | 5/h |
| `DELETE /api/me` | 3/h |
| admin | 60/min |
| session | 10/min and 100/day per IP |
| `/h/*` full bodies | 120/h per IP (304s free) |
| downloads | 30/h per IP |

**Maintenance matrix**

| Mode | Hubs, catalog | `GET /progress`, seed | `POST /sync` | Session create | Admin |
|---|---|---|---|---|---|
| `off` | yes | yes | yes | yes | yes |
| `read_only` | yes | yes | 503 | yes (upsert deferred) | yes |
| `full` | yes (hubs run local) | 503, so the bridge gives `db = null` | 503 | 503 | yes |

`MAINTENANCE_FORCE` in the environment is a break-glass override.

### 4.8 Storage model
```python
Part = Literal["main", "mocks", "cards", "legacy"]
@dataclass(frozen=True)
class PartIn:  upd: int; gz: bytes; raw_len: int; done: int | None
@dataclass(frozen=True)
class PartOut: upd: int; gz: bytes | None            # gz None => stub (server not newer than known)
@dataclass(frozen=True)
class PartResult: status: Literal["accepted","duplicate","stale"]; upd: int
class StoreError(Exception): ...
class QuotaExhausted(StoreError): kind: str; retry_at: datetime
class Unavailable(StoreError): ...
class TooLarge(StoreError): ...
class Conflict(StoreError): ...

class Store(Protocol):                                # sync methods; FastAPI runs them in the threadpool
    kind: str                                         # "firestore" | "postgres" | "memory"
    def ping(self) -> None
    def upsert_user(self, u: UserRecord, *, touch_login: bool) -> None
    def count_users(self) -> int
    def get_hub(self, uid: str, hub: str, known: dict[str, int]) -> dict[str, PartOut]
    def put_parts(self, uid: str, hub: str, parts: dict[str, PartIn], now_ms: int) -> dict[str, PartResult]  # decide()
    def list_hubs(self, uid: str) -> list[HubSummary]
    def delete_user(self, uid: str) -> None           # progress + user + tombstone; resumable
    def is_tombstoned(self, uid_hashes: list[str]) -> set[str]
    def iter_users(self, page: int = 300) -> Iterator[UserRecord]                  # cursor by id, never offsets
    def iter_progress(self, page: int = 300) -> Iterator[tuple[str, str, dict[str, PartOut]]]
    def iter_tombstones(self) -> Iterator[Tombstone]
    def restore_batch(self, recs: list[Record], *, mode: str, job_id: str, checkpoint: dict) -> BatchResult
    def wipe_for_replace(self, job_id: str) -> None
    def get_setting(self, key: str) -> tuple[dict, int] | None
    def put_setting(self, key: str, value: dict, *, expect_version: int | None) -> int
    def get_job(self, id: str) -> Job | None
    def put_job(self, job: Job) -> None
    def claim_job(self, id: str, holder: str, from_states: set[str]) -> bool         # atomic
    def add_usage(self, day: str, deltas: dict[str, int]) -> None
    def get_usage(self, keys: list[str]) -> dict[str, dict[str, int]]
```

`decide(stored_upd | None, incoming)` is a pure function shared by all adapters:
- no stored part → accept
- `incoming > stored` → accept
- `==` → duplicate (no write)
- `<` → stale (no write)

The skew check happens in validation.

**Firestore** (`(default)`, Standard, `asia-southeast1`)

| Path | Fields (all top-level, all index-exempt) |
|---|---|
| `users/{uid}` | `email, emailVerified, name, photo, provider, createdAt, lastLoginAt` |
| `progress/{uid}~{hubId}` | `uid, hub, u_main, u_mocks, u_cards, u_legacy` (int); `p_main, p_mocks, p_cards, p_legacy` (bytes: gzip JSON as sent); `n_main…n_legacy` (raw length); `done` (int); `t` (server timestamp) |
| `tombstones/{sha256("studyhubs-tombstone-v1:"+uid)}` | `at` |
| `meta/settings` | `v, tz, notice, maintenance{mode,message,until,since,by}` |
| `jobs/{id}` | `kind, state, holder, heartbeat, runAt, tz, params, checkpoint, report, createdBy, updatedAt` |
| `usage/{YYYY-MM-DD}` (PT day), `usage/m-{YYYY-MM}` | `reads, writes, deletes, fsEgress, appEgress, instanceSec` (updated with `Increment`) |

**Firestore operations**
- **GET:** `ref.get(field_paths=[u_*])` (1 read). If any `u_p > known[p]`, a second get with `[u_*, p_<changed>…]`. Unchanged parts come back as stubs.
- **PUT:** `@transactional` (`max_attempts=3`).
  1. `ref.get(field_paths=[u_*], transaction=tx)`.
  2. `decide` per part.
  3. If anything is accepted, `tx.set(ref, {fields of accepted parts, done?, uid, hub, t: SERVER_TIMESTAMP}, merge=True)`.

  Cost: 1 read + (0 or 1) write. Accepted parts in one hub = 1 write.
- **Per-user listing and delete:** `where(FieldPath.document_id() >= db.document("progress/"+uid+"~"))` and `< "progress/"+uid+"~\uf8ff"`, using the built-in name index.
- **Backup:** `order_by(__name__).start_after(last).limit(300)` on `users`, then `progress`, then `tombstones`. That is 1 read per doc and no subcollection queries.
- **Client:** `firestore.Client`. Every call passes `retry=Retry(predicate=if_exception_type(ServiceUnavailable, DeadlineExceeded, InternalServerError), initial=0.2, maximum=2, multiplier=2, timeout=8)` and `timeout=10`. **`ResourceExhausted` is never retried in the client.**
- **Error mapping:**
  - `ResourceExhausted` → `QuotaExhausted(kind, next PT midnight)`. During bulk jobs it is treated as a ramp-up throttle first (back off 1 s up to 60 s, at most 10 times).
  - `ServiceUnavailable`, `DeadlineExceeded`, `RetryError` → `Unavailable`.
  - Size-related `InvalidArgument` → `TooLarge`.
- **`firestore.indexes.json`:** `fieldOverrides` with `"indexes": []` for every field above, about 45 entries against the 200-exemption limit. **`firestore.rules`:** `match /{document=**} { allow read, write: if false; }`.

**Postgres** (`sql/0001_init.sql`, applied at startup under `pg_advisory_lock(842001)`; `psycopg[binary,pool]` 3, pool max 5)
```sql
CREATE TABLE IF NOT EXISTS schema_migrations (version int PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS users (uid text PRIMARY KEY, email text, email_verified boolean NOT NULL DEFAULT false,
  name text, photo text, provider text, created_at timestamptz NOT NULL DEFAULT now(), last_login_at timestamptz);
CREATE TABLE IF NOT EXISTS progress (
  uid text NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  hub_id text NOT NULL CHECK (hub_id ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  part text NOT NULL CHECK (part IN ('main','mocks','cards','legacy')),
  upd bigint NOT NULL, data bytea NOT NULL CHECK (octet_length(data) <= 131072), raw_len integer NOT NULL,
  done integer, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (uid, hub_id, part));
ALTER TABLE progress ALTER COLUMN data SET STORAGE EXTERNAL;          -- already gzip
CREATE TABLE IF NOT EXISTS tombstones (h text PRIMARY KEY, at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS settings (key text PRIMARY KEY, value jsonb NOT NULL, version int NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS jobs (id text PRIMARY KEY, kind text NOT NULL, state text NOT NULL, holder text,
  heartbeat timestamptz, run_at timestamptz, tz text, params jsonb NOT NULL DEFAULT '{}', checkpoint jsonb, report jsonb,
  created_by text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS usage (key text PRIMARY KEY, counters jsonb NOT NULL DEFAULT '{}');
CREATE UNLOGGED TABLE IF NOT EXISTS progress_import (LIKE progress INCLUDING DEFAULTS, job_id text NOT NULL);
CREATE UNLOGGED TABLE IF NOT EXISTS users_import (LIKE users INCLUDING DEFAULTS, job_id text NOT NULL);
```
- **`put_parts`**, in one transaction:
  1. `INSERT INTO users(uid) … ON CONFLICT DO NOTHING`.
  2. `SELECT part, upd … FOR UPDATE`.
  3. `decide`.
  4. `INSERT … ON CONFLICT (uid,hub_id,part) DO UPDATE SET … WHERE progress.upd < EXCLUDED.upd`.
- **GET:** `SELECT part, upd, CASE WHEN upd > $known THEN data END`.
- **Job claim:** `UPDATE jobs SET state='running', holder=$2, heartbeat=now() WHERE id=$1 AND state = ANY($3) RETURNING id`.

**Memory store:** dicts with the same semantics, plus fault hooks: `fail_next(op, exc)`, `quota(writes=N)`, `latency_ms`. Used by unit, API and e2e tests and by local dev. It refuses to start when `APP_ENV=production`.

### 4.9 Quota, tiers, meters, egress guard
- **Meter.** In-process counters keyed by PT day (`America/Los_Angeles`; the reset is 07:00 UTC, which is 12:30 IST until 2026-11-01 and 13:30 IST after).
  - Counted per adapter: a get is 1 read even when the doc is missing; a query is at least 1; `count()` is 1 per 1,000 entries.
  - Also counted: Firestore egress bytes (size of the serialized docs read) and app egress (response body bytes as sent).
  - Persisted every 10 minutes and on SIGTERM with `Increment` (≤ 144 writes/day) and loaded at boot (1 read).
- **Guard and tiers.**
  - `B = QUOTA_WRITES × (1 − QUOTA_RESERVE=0.05) = 19,000`, so the tier fraction is `f = writes_today / B`.
  - At `f ≥ 1`, `/api/sync` returns 429 `sync_paused` with `retryAt` = next PT midnight. Logins, meter writes, admin and jobs use the reserve.
  - On `ResourceExhausted`, the breaker sets `paused[kind]` until the reset plus 0–5 minutes, fails fast, and lets one probe through every 15 minutes.
  - Reads at ≥ 90% of 50k multiply `refreshMs` by 5; at ≥ 97%, `GET /progress` returns 429.
  - Firestore egress (monthly; the Spark monthly shut-off risk) at ≥ 80% or 95% triggers the same stretch or pause.
  - All quota logic is off when `STORE=postgres`. That deployment uses `SYNC_TIERS=1:30:0:30` (30 s flush).
- **Storage estimate.** A field-mask scan of `n_*` on demand from the admin page (1 read per doc), recalibrated free during every backup and shown as "≈, as of …". Banner at 70%; at 90%, *new* progress docs are refused with 413.
- **Render egress guard** (`HOST_EGRESS_MONTH=5e9`):
  - ≥ 70%: admin banner.
  - ≥ 90%: saver mode. Downloads return a friendly 503, known crawlers get 503 on `/h/*`, and the per-IP full-body limit drops to 20/h.
  - ≥ 97%: uncached anonymous hub loads get a lightweight 503 page; signed-in users and the API keep working.
- **`GET /api/admin/stats`:**
  ```json
  {"store":"firestore","users":143,"quotaDay":{"day":"2026-10-11","resetsAt":"2026-10-12T07:00:00Z","resetsAtLocal":"12:30 IST"},
   "firestore":{"writes":{"used":4210,"limit":20000,"budget":19000,"tier":1},"reads":{"used":3120,"limit":50000},
     "deletes":{"used":12,"limit":20000},"storage":{"estBytes":31457280,"limit":1073741824,"asOf":"…"},
     "egressMonth":{"bytes":412000000,"limit":10737418240}},
   "host":{"egressMonth":{"bytes":812000000,"limit":5000000000,"projected":2900000000},"rssBytes":201326592,
     "ramLimit":536870912,"instanceHoursMonth":262},
   "breakers":{"writes":null,"reads":null},"maintenance":{"mode":"off"},"jobs":[],"lastBackup":{"at":"…","fileSha256":"…"},
   "migrationTriggers":{"tier3DaysThisWeek":0,"readsPeakPct":12,"egressProjectedPct":58,"backupReadsPct":7,"storagePct":3}}
  ```
  **Migration triggers.** Plan the AWS move when any of these holds for a week:
  - tier ≥ 3 on 3 or more days a week
  - projected egress above 80%
  - backup read estimate above 60% of a day
  - storage above 70%

### 4.10 Backup, restore, maintenance, scheduler
**`.backup` v1 framing**

| Bytes | Field |
|---|---|
| 4 | `"SHBK"` |
| 1 | version = 1 |
| 1 | flags (bit 0 = encrypted) |
| 4 | header length, u32 BE |
| N | header JSON (plaintext, no secrets) |
| … | body |

Header:
```json
{"format":"studyhubs-backup","v":1,"createdAt":"…","app":{"version":"…","commit":"…"},
 "source":{"store":"firestore","project":"…","origin":"…"},"consistent":true,"compression":"gzip",
 "encryption":null | {"alg":"AES-256-GCM-STREAM-1","kdf":"scrypt","n":32768,"r":8,"p":1,"salt":"<b64 16>","noncePrefix":"<b64 7>","segment":1048576},
 "estimated":{"user":143,"progress":391}}
```

Body:
- **Unencrypted:** one gzip stream of NDJSON.
- **Encrypted:** frames of `[u32 BE len][ciphertext‖16 B tag]`, each over a 1 MiB segment of the gzip stream.
  - Nonce = `prefix(7) ‖ u32 BE counter ‖ last(1)`.
  - AAD = `SHA-256(magic … header)`.
  - Key = `cryptography` `Scrypt(salt, 32, n=2^15, r=8, p=1)` over the NFKC passphrase.
  - Reject a missing final frame, bytes after the final frame, a bad tag or a counter gap.

Records:
```
{"t":"settings","key":"site","value":{"tz":"Asia/Kolkata","notice":null}}       # whitelisted keys; never maintenance/jobs/secrets
{"t":"tombstone","h":"<hex>","at":"…"}
{"t":"user","uid":"…","email":"…","emailVerified":true,"name":"…","photo":"…","provider":"google.com","createdAt":"…","lastLoginAt":"…"}
{"t":"progress","uid":"…","hub":"ai103","part":"main","upd":1760171234567,"data":{…exact payload…}}
{"t":"end","counts":{"settings":1,"tombstone":0,"user":143,"progress":391},"sha256":"<hex over all preceding lines incl. \n>"}
```
On an unencrypted file, `zcat | jq` works.

**Writer.**
- Sync generator: cursor pages, then line bytes, then `lines_sha`, then `zlib.compressobj(level=6, wbits=31)`, then the optional framer, then `StreamingResponse`.
- Memory is about one page plus 2 MiB.
- `file_sha256` is computed while streaming and recorded in the backup log.
- `consistent: true` only when maintenance was `read_only` (or `full`) for the whole run.
- Cost on Firestore is about users + docs + tombstones reads, shown before starting. "Enter read-only maintenance during backup" is checked by default for migrations.

**Restore**
1. **Upload.**
   - The client reads `file.slice(0, 64 KiB)` to show the header (source, date, whether encrypted).
   - It uploads 4 MiB chunks sequentially with a SHA-256 per chunk from `crypto.subtle`.
   - The server `pwrite`s chunks into `DATA_DIR/restore/<id>/upload.part` and records them in `chunks.json`.
   - Resume uses `GET …/{id}`. The browser keys `uploadId` by name, size and `lastModified`.
2. **Validate** (no DB writes):
   - Magic and version; decrypt and check frames; gunzip; parse every line, checking its schema and canonical-JSON sanity; counts and sha256 against `end`.
   - Build a plan against the target: users new/existing, progress newer/older/identical (Postgres: `COPY` the keys into a temp table and join; Firestore: counts plus estimated writes, days needed and `fitsToday`), and tombstoned skips.
   - Write a decrypted `ready.ndjson.gz` and drop the passphrase.
   - Wrong passphrase, tampering or truncation fail here, before any write.
3. **Job** (now or scheduled):
   - Claim atomically.
   - Enter `full` maintenance, remembering the previous mode.
   - Stream from `checkpoint.line + 1` in batches of 500 records or 4 MiB:
     - **Postgres:** one transaction holds the user upserts, the newest-wins progress upserts and `UPDATE jobs SET checkpoint`, so each batch applies exactly once.
     - **Firestore:** a `WriteBatch` of ≤ 400 docs and ≤ 8 MiB, with the checkpoint doc in the **same batch**. Writes are idempotent and throttled from 50 ops/s, rising 50% every 5 minutes. On quota the job goes to `paused_quota` and resumes at the PT reset + 5 minutes.
   - Skip uids that are tombstoned in the backup or in the target.
   - `replace` mode:
     - **Postgres:** `COPY` into the import tables, then one swap transaction checks counts, runs `TRUNCATE progress, users CASCADE` and `INSERT … SELECT`.
     - **Firestore:** delete sweep (discouraged).
   - Heartbeat every 20 s. At boot, a `running` job with a heartbeat older than 2 minutes is reclaimed and resumed.
4. **Check.**
   - Counts written plus kept-newer plus skipped must equal the `end` counts; `lines_sha` must match; 1% of restored parts (at most 200) are re-read and their hashes compared.
   - On a pass: delete the staging files; if `exitMaintenanceOnSuccess`, restore the previous maintenance mode.
   - On a fail: maintenance stays `full`, the job goes to `needs_attention`, and an admin banner appears.

**States:** `scheduled → running → (paused_quota → running)* → succeeded | needs_attention | failed | cancelled | missed`.

**Scheduler.** An asyncio task that ticks every 20 s from cached jobs and settings, refreshed every 5 minutes (288 reads/day) and immediately on admin edits.
- Times are stored as a UTC instant plus an IANA timezone; the `tzdata` pip package is in the image. "Midnight" means 00:00 in `ADMIN_TZ`, default `Asia/Kolkata`, editable in Settings.
- At T − 10 minutes, the notice appears in `/api/me` and the chrome.
- Grace is 60 minutes; after that a job is marked `missed` with a banner and does not run.
- Presets: "Tonight 00:00 IST" (the default for a Postgres target) and "After the next Firestore quota reset (12:30 IST / 13:30 IST from 1 Nov)" (the default for a Firestore target).
- AWS only: `BACKUP_CRON="0 0 * * *"` writes encrypted backups to `/data/backups` (keep 14) using `BACKUP_PASSPHRASE_FILE`.

### 4.11 Client pages
- **`/` catalog.** Grouped by domain, then subject. Chips for L1–L4 and Cert, plus search.
  - Each card shows title, code, cert line, blurb, module count, accent tint and download size.
  - A **local progress badge** comes from `localSummary()` (0 server cost).
  - Buttons: **Open** (`<a href="/h/slug">`, full navigation) and **Download**.
  - A `<noscript>` list of hubs is generated at build time.
- **`/signin?next=`, `/signup`, `/reset`, `/verify`.**
- **`/signout`:** the flow in 4.6.
- **`/account`:**
  - Profile.
  - Per-hub server progress from `/api/me/progress`.
  - **Storage:** local usage per hub, and "remove local copy" for fully synced hubs.
  - Export my data, Sign out, Delete account (type DELETE, re-auth popup or password, then `DELETE /api/me`, then wipe local data and broadcast).
- **`/admin`** tabs:
  - **Overview:** meters with bars (`--good` < 50%, `--trap` < 80%, `--bad` above) and migration triggers.
  - **Backup:** estimate, optional passphrase (≥ 12 characters, never stored, "can't be recovered" warning), history with sha256.
  - **Restore:** wizard.
  - **Maintenance & Schedule.**
  - **Settings:** timezone, notice.
- **`/privacy`** and a **404** page.

**State:** a `MeProvider` context around `/api/me` plus local component state. No state library and no TanStack Query.

**Styling:** plain CSS whose `tokens.css` copies the hub tokens (`--bg #f2f4f7`, `--surface #fff`, `--line #d0d8e2`, `--fg #121b26`, `--muted #526072`, `--accent #2343c4`, `--good`, `--bad`, `--trap`, `--r:10px`). Bricolage Grotesque, Atkinson Hyperlegible and JetBrains Mono come from Google Fonts. Light and dark themes via `prefers-color-scheme` and `[data-theme]`.

**Budgets:** main ≤ 90 KB gz, Firebase chunk ≤ 80 KB gz (lazy), CSS ≤ 10 KB gz.

**Shell CSP:** Report-Only in M1, enforced in M4.
```
default-src 'self'; script-src 'self' https://apis.google.com;
connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com;
frame-src https://<project>.firebaseapp.com https://accounts.google.com; img-src 'self' data: https://lh3.googleusercontent.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; object-src 'none'; base-uri 'none'
```
Plus `COOP: same-origin-allow-popups`.

### 4.12 Deploy
**Root `.dockerignore`:**
```
**
!site/**
!technical/*/*/hubs/*-hub.html
!technical/certifications/*/*Study Hub.html
site/**/node_modules
site/**/.venv
site/**/__pycache__
site/**/dist
site/build
site/**/.env*
```

**`site/Dockerfile`** (build context = repo root):
```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS web
WORKDIR /w
COPY site/bridge/package.json site/bridge/package-lock.json site/bridge/
COPY site/client/package.json site/client/package-lock.json site/client/
RUN cd site/bridge && npm ci && cd ../client && npm ci
COPY site/ site/
RUN cd site/bridge && npm run build && cd ../client && npm run build        # client dist includes /_sh/bridge.js, /_sh/fflate.js
COPY technical/ /src/technical/
RUN node site/scripts/verify-context.mjs /src \
 && node site/scripts/collect-hubs.mjs --src /src --config site/hubs.config.json --out /w/out

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY site/server/requirements.txt .
RUN pip install --no-cache-dir --require-hashes -r requirements.txt          # includes tzdata, cryptography, firebase-admin
COPY site/server/app ./app
COPY --from=web /w/site/client/dist ./public
COPY --from=web /w/out ./build
RUN useradd -r -u 10001 app && mkdir -p /data && chown app /data
USER app
CMD ["sh","-c","exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000} --workers 1 --proxy-headers --forwarded-allow-ips='*' --no-server-header --timeout-graceful-shutdown 20"]
```

**`site/render.yaml`.** Use it as the Blueprint path if Render accepts a non-root path; otherwise create the service by hand with the same settings.
```yaml
services:
  - type: web
    name: study-hubs
    runtime: docker
    plan: free
    region: singapore
    dockerfilePath: ./site/Dockerfile
    dockerContext: .
    healthCheckPath: /healthz
    autoDeploy: false                      # CI calls the Render deploy hook after tests pass
    envVars:
      - {key: APP_ENV, value: production}
      - {key: STORE, value: firestore}
      - {key: PUBLIC_ORIGIN, value: "https://study-hubs.onrender.com"}
      - {key: ADMIN_TZ, value: Asia/Kolkata}
      - {key: DATA_DIR, value: /tmp/studyhubs}
      - {key: GOOGLE_APPLICATION_CREDENTIALS, value: /etc/secrets/firebase-sa.json}   # Render Secret File
      - {key: SECRET_KEY, generateValue: true}
      - {key: FIREBASE_PROJECT_ID, sync: false}
      - {key: FIREBASE_WEB_CONFIG, sync: false}
      - {key: ADMIN_EMAILS, sync: false}
```

**CI (`.github/workflows/site.yml`).** Path-filtered to `site/**`, the two hub globs, `.dockerignore` and the workflow file.
- **`test` job:**
  - ruff, then pytest unit and API tests
  - contract tests on memory and a `postgres:16` service
  - contract tests on the Firestore emulator (Java 21, `firebase emulators:exec --only firestore`)
  - bridge vitest
  - client build and size budgets
  - `collect-hubs --strict`
- **`e2e` job:** Docker build, then `check-image.sh`, then run the container with `STORE=memory APP_ENV=test`, then Playwright over **every catalog hub**.
- **`deploy` job** (main only, after both jobs): `curl -fsS -X POST "$RENDER_DEPLOY_HOOK"`, then poll `/api/version` until the commit matches.
- A notes-only commit triggers nothing.

**Environment variables**

| Group | Variables |
|---|---|
| App | `APP_ENV`, `PUBLIC_ORIGIN`, `PORT`, `LOG_LEVEL`, `DATA_DIR`, `SECRET_KEY`, `RENDER_GIT_COMMIT` / `GIT_COMMIT` |
| Auth | `AUTH_MODE=firebase\|fake` (fake only when `APP_ENV=test`), `SESSION_DAYS=14`, `ADMIN_EMAILS`, `ADMIN_UIDS` |
| Firebase | `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_CONFIG`, `GOOGLE_APPLICATION_CREDENTIALS` or `FIREBASE_SERVICE_ACCOUNT_B64` |
| Store | `STORE=firestore\|postgres\|memory`, `DATABASE_URL`, `PG_POOL_MAX=5` |
| Sync | `SYNC_TIERS=0.5:120:0:60,0.8:300:60:120,1.0:900:60:300` (frac:flushS:hiddenMinS:refreshS), `MAX_PART_GZ=131072`, `MAX_DOC_GZ=393216`, `MAX_BODY=2097152`, `CLOCK_SKEW_MS=900000`, `USER_WRITES_PER_DAY=300` |
| Quota | `QUOTA_TZ=America/Los_Angeles`, `QUOTA_READS=50000`, `QUOTA_WRITES=20000`, `QUOTA_DELETES=20000`, `QUOTA_RESERVE=0.05`, `QUOTA_STORAGE_BYTES=1073741824`, `QUOTA_FS_EGRESS_MONTH=10737418240`, `HOST_EGRESS_MONTH=5000000000`, `EGRESS_GUARD=on` |
| Jobs | `ADMIN_TZ=Asia/Kolkata`, `JOB_GRACE_MIN=60`, `MAX_BACKUP_BYTES=2147483648`, `BACKUP_DIR`, `BACKUP_CRON`, `BACKUP_PASSPHRASE_FILE` (AWS) |
| Ops | `MAINTENANCE_FORCE`, `REDIRECT_TO` (migration only), `FIRESTORE_EMULATOR_HOST` (test) |

Startup refuses `AUTH_MODE=fake` and `STORE=memory` when `APP_ENV=production`.

**Firebase checklist**
1. Create a Spark project.
2. Enable Google and Email/Password. **Do not** enable Identity Platform. Keep enumeration protection on. Set a password minimum of 10 characters.
3. Authorized domains: the Render host, then later the custom domain and the AWS staging host.
4. Restrict the browser API key by referrer (Render host, `https://<project>.firebaseapp.com/*`, `http://localhost:*/*`) and to the Identity Toolkit and Token Service APIs.
5. Firestore: Standard edition, `(default)` database, production mode, `asia-southeast1` (next to Render Singapore; the location is permanent).
6. Run `firebase deploy --only firestore:rules,firestore:indexes` from `site/firebase`.
7. Create a dedicated service account with `roles/datastore.user` and `roles/firebaseauth.admin`. Store its key as a Render Secret File and delete the local copy.
8. OAuth consent screen: app name "Study Hubs", with a link to `/privacy`.

**Pinger.**
- UptimeRobot HTTP check of `/healthz` every 5 minutes. That is 744 h of the 750 h allowance, which leaves room for **one** always-on service only.
- A second free check (cron-job.org) at 23:50 and 00:05 `ADMIN_TZ` before scheduled jobs.

**AWS (`site/deploy/aws/compose.yaml`).** Three services:
- **app:** same image, `STORE=postgres`, `DATA_DIR=/data`, `SYNC_TIERS=1:30:0:30`, a `/data` volume, `mem_limit: 768m`.
- **db:** `postgres:16-alpine`, password file, `pgdata` volume, healthcheck, no published port.
- **caddy:** `caddy:2-alpine` on 80/443.

Caddyfile:
```
{$SITE_DOMAIN} {
  request_body { max_size 16MB }
  reverse_proxy app:10000
}
```
`backup-cron.sh` on the host runs `pg_dump -Fc` nightly and keeps 7. Optionally copy `/data/backups` to S3.

**Migration runbook (`RUNBOOK.md`)**
1. **T − 7 days:**
   - Deploy on AWS under a temporary hostname and add it to Firebase Authorized domains. It is the same Firebase project, so uids and session cookies carry over.
   - Rehearse: Render backup → AWS validate → restore `merge` → clean check report → Playwright smoke against AWS → wipe.
   - Lower the DNS TTL to 60 s.
2. **T0:**
   1. Scheduled Render `read_only` maintenance at 23:40 IST.
   2. Final encrypted backup with `consistent: true`; note its `fileSha256`.
   3. AWS: upload, then validate (the sha256, counts and lines hash must all match).
   4. Schedule the restore for 00:00 IST with `mode=replace` (empty target) or `merge` and `exitMaintenanceOnSuccess`.
   5. After a clean check, switch DNS.
   6. Render: `REDIRECT_TO` set, mode `full`, "moved" notice.
3. **T + 7 days:** suspend Render. Keep the Firestore data for 30 days as a rollback, then delete it.

Clients that are offline or still hitting Render keep their progress locally. The hubs push local-newer parts when they reach AWS.

### 4.13 Tests
**Unit (pytest)**
- `decide()` table
- validation: shapes, caps, gzip-bomb bound, skew, hub mismatch
- `publicId` HMAC
- CSRF and Origin checks; cookie flags; admin predicate; re-auth window
- PT-day boundaries including the 2026-11-01 DST switch
- tier selection; breaker trip, reset and probe; per-user cap
- precompressed content negotiation and 304s
- backup round-trip, plain and encrypted, plus a flipped byte, truncation, a reordered frame, an extended file, a wrong passphrase and bad `end` counts
- scheduler with an injected clock: due, grace, missed, double claim prevented
- restore killed after batch k, resumed, ending in an identical state; re-run is idempotent

**Contract suite** (one parametrized set over memory, Postgres via `dev_pg.sh` locally or a CI service with `REQUIRE_PG=1`, and the Firestore emulator)
- round-trip; partial-part merge leaves the other parts intact
- `known` stubs
- accepted, duplicate and stale results
- two concurrent `put_parts` × 500 with no older write ever landing
- id-range listing
- delete cascade plus tombstone
- `iter_*` over 1,234 docs with page 100: exact, ordered, no duplicates
- `restore_batch` atomic with its checkpoint, and idempotent
- `claim_job` exclusive
- usage increments

Quota and outage paths are injected by monkeypatching the client with the exception fixtures captured in M1.

**Bridge (vitest + jsdom, fake timers)**
- path parsing
- the snapshot `exists` property; `data()` returns a deep copy
- waiter resolution and rejection
- freshen on LKEY writes
- `ownU` handover, and no handover of the tab's own record
- tier timers
- unload dedupe and choice of gzip path
- every row of the error-mapping table
- AI shim on both paths
- legacy seed rules
- owner-mismatch gating
- logout guard

**API (httpx TestClient, memory store, fake auth)**
- auth matrix for every endpoint (anonymous, user, admin, admin without re-auth)
- 401/403/413/422/429/503 response shapes
- single-use ticket
- chunk idempotency and resume

**E2E (Playwright: Chromium on every catalog hub, plus a WebKit mobile smoke test)**

The prototype's verified scenarios S1–S10 are ported as acceptance tests. New ones:
- **S11:** hash CSP shows zero violations on every hub after clicking every tab.
- **S12:** cost guard. A scripted 40-minute session under `page.clock` makes ≤ 26 writes at tier 1 and ≤ 14 at tier 2.
- **S13:** account switch on one browser. A's dirty data triggers the dialog, and the server log shows no cross-uid write.
- **S14:** clock skew of +1 day shows the banner and stores nothing.
- **S15:** maintenance `read_only` and `full`.
- **S16:** quota at the budget gives "Sync paused" with no "storage full" toast, the chrome shows the reset time, and the outbox drains after the fault clears.
- **S17:** a backup from instance A restores into instance B (Postgres) with a clean report.
- **S18:** `kill -9` during apply, restart, resume, identical final state.
- **S19:** served file minus the injection equals the original, and the download sha256 equals the source, for every hub.

**Manual staging checklist per release:** real Google popup sign-in, an email sign-up with verification, and a password reset.

### 4.14 Milestones and acceptance criteria
| # | Scope | Acceptance |
|---|---|---|
| **M0 Static site** (1–2 sessions) | `site/` skeleton, `.dockerignore`, collector (injection, hashes, br/gz, lint, report), hub serving and download, bridge anonymous mode (AI shim, modal, chrome without auth), SPA catalog, Dockerfile, CI `test`/`e2e`, Render deploy through the hook, UptimeRobot | All 7 hubs at `/h/<slug>` on onrender.com, local progress works. S1, S2, S7, S11, S19 pass. Zero `/api` calls from anonymous hub views. AI buttons visible; modal on every AI path; `aiJSON` leaves no "Stopped.". Largest hub ≤ 210 KB on the wire (br). 304s on revisit. `check-image.sh` clean (no `.md`, `_meta`, `sessions`, `practice` or `work`). A notes-only commit deploys nothing. |
| **M1 Accounts and Firestore sync** (2 sessions) | Firebase project and checklist, quota probe on a throwaway Spark project (capture the `ResourceExhausted` class and message as fixtures), session cookie, `/api/me`, progress GET, `/api/sync`, seed, memory and Firestore stores, `decide`, meter, guard, tiers, bridge DB (outbox, freshen, unload gzip, error map, handover, owner tag), sign-in, sign-up, reset and verify pages, merge and logout flows, AI-901 legacy sync, rules and exemptions deployed | S3–S6, S8–S10, S12–S14, S16 pass. Cross-device sync works on staging. Every `/api/sync` costs ≤ 1 write per hub (meter). Quota trip degrades with an honest pill and banner. Exemptions verified in the console. |
| **M2 Admin, account, ops** (1–2 sessions) | Stats and meters, maintenance modes plus scheduled windows, streaming backup with optional encryption and log, egress guard, `/account` (progress, storage, export, delete), `/privacy` | S15 passes. A backup of 20k synthetic emulator docs peaks at RSS ≤ 300 MB under `--memory 512m --cpus 0.1`. Account delete leaves 0 docs, 1 tombstone and no Auth user. A scheduled maintenance window fires within 60 s and survives a restart before `runAt`. |
| **M3 Postgres and restore** (2 sessions) | Postgres store and migrations, contract suite on all three stores, chunked upload, validate, plan, restore jobs with checkpoints, `replace` swap, scheduler UI and presets, `backup_tool.py` | Contract suite green on memory, Postgres and the Firestore emulator. S17 and S18 pass. Tampered, truncated or wrong-passphrase files fail before any write. A missed window is not executed. Deploy overlap cannot double-run a job. |
| **M4 AWS readiness and hardening** (1 session) | compose, Caddy, backup cron, RUNBOOK rehearsal, shell CSP enforced, rate-limit review, README; origin-move kit only if the origin will change | Full runbook rehearsal on local compose or a throwaway VM, with timings recorded. Zero CSP violations across e2e. Rollback steps tested. |

### 4.15 For the owner, and facts to verify before relying on them
**Questions for the owner (none re-opens a decision already made)**
1. **Custom domain before public launch, with Cloudflare in front.** Recommended. Moving later from `*.onrender.com` strands anonymous localStorage; the fallback is a `/moved` page that hands progress to the new origin's `/import` page through `postMessage`. Cloudflare also removes Render egress as the first limit.
2. Firestore location: `asia-southeast1` (recommended) or `asia-south1`.
3. The modal wording with the "open it as an artifact" tip (F21).

**Verify (each has a fallback in this design)**
- Render free: a Blueprint path under `site/`, the deploy hook, Secret Files, the 5 GB egress figure and the behaviour when it is exceeded, and that BuildKit honours the allow-list (the `verify-context` step is the real guarantee).
- Firestore: whether a get of a missing doc is billed (assumed yes), behaviour at the 1 GiB cap (treated as `storage_full` at 90%), and the exact `ResourceExhausted` message (M1 probe).
- A Firefox `keepalive` smoke test.

**Backlog after v1, in order**
1. Firestore `update_time` precondition fast path (removes the guard read), if reads exceed 60%.
2. Conflict copies (INTEGRITY §3.4/§5.3).
3. Automatic eviction of synced local copies when localStorage is full.
4. Pre-seeding engine hubs.
5. App Check.
6. "Sign out everywhere".
7. Analytics.

**Evidence files from this review**
- CSP check: `scratchpad/chief/cspserver.js`, `.../chief/csptest.js`, `.../chief/csp-result.json`
- Hold-until-ack check: `.../chief/holdack/bridge.js` (patched copy of the prototype), `.../chief/holdack/hold.js`, `.../chief/holdack/hold-result.json`
- Brief: `scratchpad/design-brief.md`
- Prototype bridge (the starting point for `site/bridge/src`): `scratchpad/proto/bridge.js`