# Build contracts (shared by every part of `site/`)

These are the fixed interfaces between the collector, bridge, server, client, e2e tests and deploy files. The design behind them is in [architecture-spec.md](architecture-spec.md). The agreed scope is in [implementation-plan.md](implementation-plan.md). If this file and the spec disagree, this file wins for v1.

## 0. Ground rules
- **Never modify hub HTML files** or anything outside `site/`, the root `.dockerignore` and `.github/workflows/site.yml`.
- Pin exact dependency versions (no `^`/`~`). Use releases that are at least 2 weeks old.
- **Vault `.gitignore` traps:**
  - These are ignored repo-wide: `build/`, `dist/`, `*.gz`, `*.png`, `*.jpg`, `*.zip`, `*.bin`, `*.db`, `*.sqlite3`, `secrets.*`, `credentials*.json`, `.env*`, `node_modules/`, `.venv/`.
  - So: never name a source file `secrets.*`, and never commit fixtures with those extensions; generate them at test time. Use an SVG favicon.
  - Generated output goes only to `site/build/` and `site/server/public/`. `site/.gitignore` lists both.
- **Names:** folders and non-code files use kebab-case. Python modules are snake_case and TS/React files use their usual case; the vault's rule allows this for code repos.
- Agents never run `git commit`/`git push`.

## 1. Generated layout (local dev and Docker)
```
site/server/public/            # React build (Vite outDir) — served at /
  index.html  assets/*  favicon.svg  robots.txt
  _sh/bridge.js  _sh/bridge.js.br  _sh/bridge.js.gz      # bridge build output
  _sh/fflate.js  (+ .br/.gz)                              # lazy gzip helper (M1 uses it)
site/build/                    # collector output
  hubs/<slug>/index.html  index.html.br  index.html.gz          # served variant (bridge injected)
  hubs/<slug>/original.html  original.html.br  original.html.gz # exact original bytes
  catalog.internal.json        # all entries incl. source path + CSP
  catalog.json  catalog.json.br  catalog.json.gz                # public subset
  build-report.json
```
In Docker: `/app/public` = `site/server/public`, `/app/build` = `site/build`.
Server env `PUBLIC_DIR` (default `<server>/public`) and `HUBS_DIR` (default `<site>/build`).

## 2. Commands
```bash
cd site/bridge && npm ci && npm run build && npm test      # -> ../server/public/_sh/
cd site/client && npm ci && npm run build && npm test      # -> ../server/public/  (must NOT delete public/_sh)
node site/scripts/collect-hubs.mjs --src . --config site/hubs.config.json --out site/build [--strict]   # from repo root
cd site/server && python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt && .venv/bin/pytest
cd site/server && .venv/bin/uvicorn app.main:app --port 10000
cd site/e2e && npm ci && npx playwright test               # BASE_URL default http://127.0.0.1:10000
```
Order for a full local build: bridge → client → collector → server.
Vite must use `emptyOutDir: false`. It also removes its own old `assets/` before building, so a stale bundle is never served and `_sh/` survives.

## 3. Catalog entry (`catalog.json` is an object `{version, generatedAt, hubs:[…]}`)
```json
{"id":"ai103","slug":"ai-103","title":"AI-103 Study Hub","code":"AI-103","kind":"cert","level":null,"levelLabel":null,
 "domain":"certifications","domainLabel":"Certifications","subject":"ai-103","subjectLabel":"AI-103",
 "cert":"Microsoft Certified: Azure AI Apps and Agents Developer Associate",
 "blurb":"Become an Azure AI apps and agents developer","modules":37,"accent":"#2343c4","engine":"v2",
 "storageKeys":["studyhub.ai103.v2","studyhub.ai103.mockrun"],"legacyKeys":[],
 "downloadName":"AI-103 Study Hub.html","bytes":802992,"brBytes":201778,"sha256":"<hex of original>"}
```
- `kind` is `"level"` (L1–L4 capability hubs) or `"cert"`.
- `level` is 1–4 or null. `levelLabel` is "Foundation", "Proficient", "Specialist", "Expert" or null.
- `engine` is `"v2"` (modern), `"legacy"` (AI-901) or `"static"` (unknown: served, local-only).
- `bytes`, `sha256` and `brBytes` describe the **original** file (`brBytes` is its brotli size, shown as the download size).
- `modules`, `cert`, `blurb` and `accent` can be null (a `static` hub has `modules: null` and empty `storageKeys`). A legacy hub has `storageKeys: []`; its progress key is `legacyKeys[0]`.
- `catalog.internal.json` has the same `{version, generatedAt, hubs}` shape. Each entry adds `source` (repo-relative path), `csp` (the full header value), `servedSha256` and `servedBytes`.
- Slugs today: `dsa-l1-foundation`, `dsa-l2-proficient`, `dsa-l3-specialist`, `ab-620`, `ai-103`, `ai-500`, `ai-901`.
- Ids: `dsa-l1`, `dsa-l2`, `dsa-l3`, `ab620`, `ai103`, `ai500`, and `ai901` (legacy, from config).

## 4. Injection (byte-exact)
Insert immediately before the first `</head>` (case-insensitive). If there is none, insert before the first `<script`. If neither exists, use engine `static` with no injection.
```html
<script src="/_sh/bridge.js" data-hub-id="ai103" data-slug="ai-103" data-engine="v2"></script>
```
Legacy hubs get, as one inserted span:
```html
<script src="/_sh/bridge.js" data-hub-id="ai901" data-slug="ai-901" data-engine="legacy" data-legacy-keys="ai901hub.v1"></script><script src="/api/seed/ai901.js"></script>
```
Invariant (tested): served bytes minus the inserted span equal the original bytes.
The same rule applies to every engine: a `static` hub that has a `</head>` or a `<script` gets the bridge with `data-engine="static"`.

## 5. Server routes (M0)
| Route | Behaviour |
|---|---|
| `GET /healthz` | `{"ok":true}`, `no-store`, no DB |
| `GET /api/version` | `{"version":"0.1.0","commit":"<GIT_COMMIT or RENDER_GIT_COMMIT or 'dev'>"}` |
| `GET /api/me` | M0: `{"signedIn":false}` (M1 adds auth) |
| `GET /api/seed/{hubId}.js` | Anonymous M0 body: `window.__studyhubsBridge&&__studyhubsBridge.legacySeed({signedIn:false});` with `Content-Type: text/javascript`, `Cache-Control: no-store`, `Vary: Cookie`. Unknown or non-legacy hub: 404 JS comment |
| `GET /catalog.json` | Precompressed public catalog, `max-age=300, stale-while-revalidate=86400` |
| `GET /h/{slug}` | Served variant. Content negotiation br > gzip > identity, strong ETag per encoding, 304 on `If-None-Match`, `Vary: Accept-Encoding`, `Cache-Control: public, max-age=300, stale-while-revalidate=86400`, per-hub CSP from the internal catalog. `/h/{slug}/` → 301 to `/h/{slug}`. An id used as slug → 301 to the slug. Unknown → 404 HTML page |
| `GET /h/{slug}/download` | Original bytes (negotiated like the page; the browser saves the decoded original). `Content-Disposition: attachment; filename="<ascii fallback>"; filename*=UTF-8''<pct-encoded downloadName>`, `Content-Security-Policy: sandbox`, `max-age=3600`, ETag = sha256 (the identity ETag is `"<catalog sha256>"`; br/gzip responses carry the sha256 of the bytes sent, so each encoding has its own strong ETag) |
| `GET /_sh/{file}` | bridge.js / fflate.js precompressed, `max-age=600, stale-while-revalidate=86400`, ETag. A miss is a plain-text 404 |
| `GET /assets/*` | `public, max-age=31536000, immutable`. A miss is a plain-text 404, never the SPA shell |
| SPA routes `/`, `/signin`, `/signup`, `/reset`, `/verify`, `/signout`, `/account`, `/admin`, `/admin/*`, `/privacy` | `index.html`, `no-cache` |
| Any other non-API path | `index.html` with status 404 (the SPA shows its NotFound page) |
| `/api/*` unknown | JSON `{"code":"not_found","message":"…"}` 404 |
| `/robots.txt` | from public; disallows `/api/`, `/h/*/download`, `/admin` |

**Every response:**
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Strict-Transport-Security: max-age=31536000` when `APP_ENV=production`
- `Cross-Origin-Opener-Policy: same-origin` on hub pages; `same-origin-allow-popups` on the shell (Firebase popup)

**Hub CSP:** `default-src 'none'; script-src 'self' <'sha256-…' per inline script>; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'`

**API errors** use one shape: `{"code","message","retryAfter"?}`.

**Env (M0):** `APP_ENV` (development|test|production), `PUBLIC_ORIGIN`, `PORT` (10000), `PUBLIC_DIR`, `HUBS_DIR`, `GIT_COMMIT`/`RENDER_GIT_COMMIT`, `LOG_LEVEL`.

## 6. Bridge (M0 = anonymous mode; module layout ready for M1 sync)
- One classic IIFE (ES2019), ≤ 14 KB gzipped. Built with esbuild from TypeScript.
- It reads `document.currentScript.dataset` (`hubId`, `slug`, `engine`, `legacyKeys`).
- It defines `window.claude = Object.freeze({use})` synchronously.
- **Signed-in hint:** the readable cookie `sh_hint`. If it is absent, the visitor is anonymous. In anonymous mode the bridge makes **zero** network requests.
- **`use()` capabilities:**
  - `use("db")` and `use("user")` resolve `null` (anonymous). M1 adds signed-in mode.
  - `use("sample")` resolves at once to the AI shim `AI`:
    - `AI(input, opts)` opens the modal and returns `Promise.reject(Object.assign(new Error("ai_unsupported"), {code:"cancelled", text: MSG_MD}))`. It never calls `onText`.
    - `AI.json()` opens the modal and resolves `null`.
    - `MSG_MD = "**AI isn't supported here.** [Download this hub](" + location.origin + "/h/<slug>/download) and use it in your own AI provider for Ask-AI features."`
  - Any other name rejects `{code:"not_declared"}`.
- **Modal:**
  - A closed shadow root at `z-index: 2147483647`, `role="dialog"`, `aria-modal="true"`, Esc closes it, with a focus trap and focus restore. Only one opens at a time.
  - Title: "AI isn't supported here".
  - Body: "Download this hub and use it in your own AI provider for Ask-AI features (for example, upload it to Claude and open it as an artifact). Your progress on this site isn't included in the file."
  - Buttons: **Download this hub** (`<a download href="/h/<slug>/download">`) and **Close**.
- **Chrome:**
  - A small floating pill in a closed shadow root: bottom-left on phones and tablets, bottom-centre from 861 px (where the hubs' Learn rail becomes a sticky left column whose last items would otherwise sit under it). It follows the hub theme (`data-theme` / `prefers-color-scheme`), is safe-area padded and hidden in print.
  - Notices stack above the pill. Within the stack's height (+ 64 px) of the end of the page, the stack steps aside (the pill stays) so the hub's last controls are never covered; it returns when the page scrolls up.
  - Items: "← All hubs" (`/`), "Sign in" (`/signin?next=/h/<slug>`), "Download".
  - It shows a dismissible notice "Progress is saved only in this browser — sign in to keep it" once the hub's LKEY first gets `U.main > 0`. Dismissal is stored in `studyhubs.ui.nudge.<hubId>`.
- **`Storage.prototype.setItem` / `removeItem` wrapper** (installed in M0 because it is needed by M1/legacy). It calls the original first and rethrows. On a legacy-key write it records the sidecar `studyhubs.legacy.<key>.upd = Date.now()`. On `QuotaExceededError` for hub keys it shows the chrome notice "Browser storage is full".
- `window.__studyhubsBridge = {version, legacySeed(cfg), flushNow(), stats()}`. `legacySeed({signedIn:false})` is a no-op in M0.
- **Keys the bridge owns:** `studyhubs.owner`, `studyhubs.synced.<id>`, `studyhubs.legacy.<key>.upd`, `studyhubs.ui.*`. Site code never writes the `studyhub.` or `ai901hub.` prefixes.
- **Module layout:**
  - `src/index.ts` (boot)
  - `config.ts`, `ai.ts`, `chrome.ts`, `storage-hook.ts`, `legacy.ts`
  - `local-progress.ts`: key names and summaries; the client copies its logic
  - `db.ts`, `outbox.ts`, `transport.ts`: M1; `db.ts` may be stubbed
  - `vendor`: fflate via npm, built separately to `_sh/fflate.js` as `window.__shFflate = {gzipSync}`

## 7. Client (React + Vite + TS + react-router)
- **Routes:**
  - `/`: the catalog.
  - `/signin`, `/signup`, `/reset`, `/verify`, `/signout`, `/account`, `/admin/*`: M0 placeholders saying "Accounts are coming soon".
  - `/privacy`: a short placeholder.
  - `*`: NotFound.
- **Catalog:**
  - Fetches `/catalog.json`. Groups by `domainLabel`, then `subjectLabel`. Has filter chips (All, L1, L2, L3, L4, Cert) and search across title, code, cert and blurb.
  - Each card shows the accent stripe, code, title, level badge or cert line, blurb, module count, download size (`brBytes`), local progress ("3 / 8 modules", read from `localStorage[storageKeys[0]].S.done`, or for legacy from `ai901hub.v1`.done), **Open** (`<a href="/h/<slug>">`, a full navigation) and **Download** (`/h/<slug>/download`).
- **Header:** brand "Study Hubs" and a "Sign in" link.
- **Footer:** Privacy link and a "Progress is saved in this browser" note.
- **Styling:** plain CSS that copies the hub tokens (see `tokens.css` in the spec, §4.11). Fonts are Bricolage Grotesque, Atkinson Hyperlegible and JetBrains Mono from Google Fonts. Light and dark themes. Works at phone width with a 16 px gutter.
- **Budgets:** main JS ≤ 90 KB gz, CSS ≤ 10 KB gz.

---

# M1: accounts and Firestore sync

These sections are binding for M1. Where they are silent, follow [architecture-spec.md](architecture-spec.md):
- §4.5 for the bridge
- §4.6 for auth
- §4.7 for the API
- §4.8 for storage
- §4.9 for quota

## 8. Environment (M1 additions; every field optional with safe dev defaults)

| Var | Default | Notes |
|---|---|---|
| `AUTH_MODE` | `firebase` in production, `fake` in test/development | `fake` is **refused** when `APP_ENV=production` |
| `STORE` | `firestore` in production, `memory` otherwise | `memory` is refused in production. `postgres` arrives in M3 |
| `SECRET_KEY` | dev/test: a fixed constant plus a warning | Production: required, ≥ 32 bytes. Used for `publicId` and fake session signing |
| `SESSION_DAYS` | `14` | |
| `FIREBASE_PROJECT_ID` | – | Required when `AUTH_MODE=firebase` or `STORE=firestore` |
| `FIREBASE_WEB_CONFIG` | – | JSON `{"apiKey","authDomain","projectId","appId"}`, returned by `/api/config` |
| `GOOGLE_APPLICATION_CREDENTIALS` / `FIREBASE_SERVICE_ACCOUNT_B64` | – | Service-account key: a file path (Render Secret File) or base64 JSON |
| `FIRESTORE_EMULATOR_HOST` | – | Tests/CI only |
| `TRUSTED_PROXY_HOPS` | `1` in production, `0` otherwise | Client IP for rate limits = the X-Forwarded-For entry at position `-hops` (right-most hops appended by the platform), else the socket peer |
| `SYNC_TIERS` | `0.5:120:0:60,0.8:300:60:120,1.0:900:60:300` | `frac:flushS:hiddenMinS:refreshS`; at `f ≥ 1.0` the server pauses sync |
| `QUOTA_ENFORCE` | `1` for firestore/memory | `0` disables tiers and the budget (Postgres later) |
| `QUOTA_TZ`, `QUOTA_READS`, `QUOTA_WRITES`, `QUOTA_DELETES`, `QUOTA_RESERVE` | `America/Los_Angeles`, `50000`, `20000`, `20000`, `0.05` | The budget is `B = QUOTA_WRITES × (1 − QUOTA_RESERVE)` and `f = writesToday / B` |
| `MAX_PART_GZ`, `MAX_DOC_GZ`, `MAX_BODY`, `MAX_BODY_DECOMPRESSED` | `131072`, `393216`, `2097152`, `8388608` | |
| `CLOCK_SKEW_MS` | `900000` | |
| `USER_WRITES_PER_DAY` | `300` | Accepted hub-doc writes per uid per Pacific day; then 429 `sync_paused` |
| `MAINTENANCE_FORCE` | unset | `read_only` or `full`. M1 reads only this; M2 adds the admin setting |

## 9. Auth, session cookies, CSRF
- **Session cookie name:**
  - `__Host-sh_session` when `PUBLIC_ORIGIN` is https.
  - `sh_session` when it is http (local/test).
  - Flags: `HttpOnly; SameSite=Lax; Path=/; Max-Age=SESSION_DAYS*86400`, plus `Secure` only on https.
- **Hint cookie `sh_hint`:**
  - Value: `publicId`.
  - Readable by JS, with the same Secure, SameSite, Path and Max-Age rules.
  - It is only a hint. The server never trusts it.
- **`publicId`** = the first 22 characters of `base64url(HMAC-SHA256(SECRET_KEY, "publicId:" + uid))`. The raw uid never reaches hub JavaScript.
- **`POST /api/auth/session` `{idToken}`:**
  - `firebase` mode:
    1. `auth.verify_id_token(idToken, check_revoked=True, clock_skew_seconds=10)`.
    2. Require `auth_time` ≤ 300 s ago; otherwise 403 `stale_login`.
    3. If the provider is `password` and `email_verified` is false: 403 `email_unverified`.
    4. Upsert the user (`lastLoginAt` at most once per 24 h).
    5. `create_session_cookie(idToken, SESSION_DAYS)`.
    6. Set both cookies.
    7. Respond 200 `{user}`.
  - `fake` mode: `idToken` = `"fake:" + base64url(JSON {uid, email, name?, emailVerified?, provider?})`. The server mints an HMAC-signed session (`b64url(json).b64url(sig)` with `exp`) and runs the same checks (unverified password → 403). This is the only way e2e tests sign in, and the client's fake-mode test form uses it too.
  - Rate limit: 10/min and 100/day per client IP. 401 `invalid_token`, 503 `maintenance` when the mode is `full`.
- **`POST /api/auth/logout`:** 204, clears both cookies.
- **Session checks on each request:**
  - `verify_session_cookie(check_revoked=False)`, cached 5 min in an LRU (≤ 1000) keyed by sha256 of the cookie.
  - An invalid or expired cookie is treated as anonymous, and **both cookies are cleared** in that response.
- **CSRF:** every `/api/*` request that isn't GET/HEAD/OPTIONS must carry `X-StudyHubs: 1` **and** `Origin == PUBLIC_ORIGIN`. If Origin is absent, `Sec-Fetch-Site: same-origin` is accepted instead. Otherwise 403 `{code:"csrf"}`. No CORS headers, ever.
- **`GET /api/config`:** `{"authMode":"firebase|fake","firebase":{apiKey,authDomain,projectId,appId}|null,"origin":PUBLIC_ORIGIN,"version":"…"}`, `Cache-Control: no-cache`.
- **`GET /api/me`:**
  - Anonymous: `{"signedIn":false}`.
  - Signed in: `{"signedIn":true,"user":{"publicId","email","name","photo","provider","emailVerified"},"maintenance":{"mode","message","until"},"policy":{…}}`.
- **Shell framing:** shell pages send `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'` (the review's M1 note). The seed script gets `Cross-Origin-Resource-Policy: same-origin`.

## 10. Progress API (`/api/progress`, `/api/sync`, seed)
- **Parts by engine:**
  - `v2`: `main`, `mocks`, `cards`. The payloads are exactly what the hub builds: `{hub,upd,S}`, `{hub,upd,list}` (≤ 40 items), `{hub,upd,map}`.
  - `legacy`: `legacy` = `{hub,upd,key,raw}`. `key ∈ legacyKeys`; `raw` is a string that parses to a JSON object.
  - `hub` must equal the hubId.
  - `upd` must be an integer in `[1.6e12, now + CLOCK_SKEW_MS]`. Above the limit: 422 `clock_skew` for the whole request.
- **`GET /api/progress/{hubId}?known=main:<upd>,mocks:<upd>,cards:<upd>`** (legacy: `known=legacy:<upd>`):

  | Case | Response |
  |---|---|
  | Unknown hub (not in catalog) | 404 JSON |
  | Anonymous or invalid session | 200 `{"signedIn":false}` (cookies cleared if one was sent) |
  | Maintenance `full` | 503 `maintenance` |
  | Signed in | 200 `{"signedIn":true,"hub":"<hubId>","user":{"publicId"},"parts":{"<part>": payload \| {"stub":true,"upd":n} \| null},"policy":{…},"maintenance":{"mode":…}}` |

  - A part comes back as a **stub** when the stored `upd ≤ known`; a missing part is `null`.
  - Reads: 1, plus 1 more only if some part is newer than known.
- **`POST /api/sync`** (CSRF-protected; `Content-Encoding: gzip` accepted):
  - Body: `{"hubs":{"<hubId>":{"<part>":payload}}}`. At most 25 hubs, wire ≤ `MAX_BODY`, decompressed ≤ `MAX_BODY_DECOMPRESSED`.
  - Success: 200 `{"results":{"<hubId>":{"<part>":{"status":"accepted|duplicate|stale|rejected","upd":n,"code"?:"too_large|invalid"}}},"policy":{…}}`.
    - `upd` in each result is the **stored** stamp after the decision.
    - A part over `MAX_PART_GZ` (gzip of the compact JSON), or a doc over `MAX_DOC_GZ`, is `rejected` with `too_large`.
  - Request-level errors: 401 `unauthenticated`, 403 `csrf`/`email_unverified`, 404 unknown hub, 413 `too_large` (body), 422 `invalid`/`clock_skew`, 429 `rate_limited`/`sync_paused` (with `retryAt` ISO + `Retry-After`), 503 `maintenance`/`unavailable`.
  - Rate limit: 12/min burst 6 per uid, plus `USER_WRITES_PER_DAY`.
- **Newest wins:** `decide(stored_upd, incoming_upd)` in `app/progress/decide.py`:
  - no stored part → `accepted`
  - incoming greater → `accepted`
  - equal → `duplicate`
  - lower → `stale`

  Each hub is one transaction (read the `u_*` stamps, decide each part, write the accepted parts in one write).
- **Policy:** `{"tier":1|2|3|"paused","flushMs":n,"hiddenMinMs":n,"refreshMs":n,"pausedUntil":ISO|null}`, sent with every progress, sync and me response.
- **`GET /api/seed/{hubId}.js`** (legacy only):
  - Signed in: `window.__studyhubsBridge&&__studyhubsBridge.legacySeed({signedIn:true,publicId:"…",policy:{…},parts:{legacy:{upd,raw}}|{}});`.
  - Anonymous: the M0 body.
  - Headers: `no-store`, `Vary: Cookie`, CORP `same-origin`.
- **Error body** everywhere: `{"code","message","retryAfter"?,"retryAt"?}`.

## 11. Store (Python, `app/store/`)
- **`base.py`:**
  - Error classes: `StoreError`, `QuotaExhausted(kind, retry_at)`, `Unavailable`, `TooLarge`, `Conflict`.
  - Dataclasses `UserRecord`, `PartIn(upd, gz, raw_len, done)`, `PartOut(upd, gz|None)`, `PartResult(status, upd)`.
  - The `Store` Protocol:

| Method | M1 status |
|---|---|
| `kind`, `ping()` | implement |
| `upsert_user(u, *, touch_login)`, `get_user(uid)`, `count_users()` | implement |
| `get_hub(uid, hub, known) -> dict[part, PartOut]` | implement |
| `put_parts(uid, hub, parts: dict[part, PartIn], now_ms) -> dict[part, PartResult]` | implement (transactional, newest-wins via `decide`) |
| `add_usage(day, deltas)`, `get_usage(keys)` | implement |
| `get_setting(key)`, `put_setting(key, value, *, expect_version)` | implement |
| `list_hubs`, `delete_user`, `iter_*`, `restore_batch`, `wipe_for_replace`, `get_job`/`put_job`/`claim_job`, tombstones | declared, `raise NotImplementedError("M2/M3")` |

- **`memory.py`:**
  - Thread-safe dicts with the same semantics.
  - Counts reads and writes like Firestore.
  - Fault hooks: `fail_next(op, exc, count=1)` and `latency_ms`.
  - Refuses `APP_ENV=production`.
- **`firestore.py`** (data model per spec §4.8):
  - **Documents:**
    - `users/{uid}`
    - `progress/{uid}~{hubId}`, with top-level fields `uid, hub, u_<part>` (int), `p_<part>` (bytes: gzip compact JSON), `n_<part>` (raw length), `done` (int), `t` (server timestamp)
    - `usage/{YYYY-MM-DD}` (Pacific day) and `usage/m-{YYYY-MM}`, holding `reads, writes, deletes, fsEgress, appEgress` via `Increment`
    - `meta/settings`
  - **Client:**
    - Every call passes `timeout=10` and a short `Retry` that **never retries `ResourceExhausted`**.
    - `ResourceExhausted` → `QuotaExhausted(kind, next_pacific_midnight)`.
    - `ServiceUnavailable`, `DeadlineExceeded` and `RetryError` → `Unavailable`.
  - Firestore Security Rules deny everything. Index exemptions for every field live in `site/firebase/firestore.indexes.json` (`fieldOverrides`, `indexes: []`).
- **Factory:** `factory.py` picks the store from `STORE`.
- **Contract tests:** `tests/contract/` runs one parametrized suite on memory and on the Firestore emulator (skipped unless `FIRESTORE_EMULATOR_HOST` is set). It covers:
  - round-trip
  - partial merge
  - known/stubs
  - accepted, duplicate and stale
  - concurrent `put_parts` (no older write ever lands)
  - usage increments
  - settings optimistic version

## 12. Quota meter, tiers, guard (`app/quota/`)
- **Pacific day:** `pacific.py` computes PT day keys and the next reset (handles the DST switch on 2026-11-01).
- **Meter:**
  - In-process counters per PT day: reads, writes, deletes and egress.
  - Persisted to the store every 10 min and on shutdown, and loaded at boot.
  - Memory store: in-process only.
- **Guard:**
  - `f = writes_today / B` → tier from `SYNC_TIERS`.
  - At `f ≥ 1.0`: `/api/sync` returns 429 `sync_paused` with `retryAt` = the next PT midnight.
  - On `QuotaExhausted` the breaker sets paused until the reset plus 0–5 min of jitter and fails fast; one probe goes through every 15 min.
  - Reads at ≥ 90% of `QUOTA_READS` multiply `refreshMs` by 5.
- **Per-user cap:** an in-memory per-uid daily accepted-write counter enforces `USER_WRITES_PER_DAY`.
- With `QUOTA_ENFORCE=0`, the policy is always tier 1 and nothing is paused.

## 13. Bridge signed-in mode (spec §4.5 is the detailed reference)
- **Signed-in check:**
  - `sh_hint` present → `publicId = sh_hint`.
  - `owner = localStorage["studyhubs.owner"]`.
  - `mismatch = owner && owner !== publicId`. On a mismatch, `use("db")` and `use("user")` resolve `null`, and the chrome shows "This browser has progress from another account" linking to `/account`.
- **Prefetch** (only signed in, no mismatch, engine `v2`): `GET /api/progress/<hubId>?known=main:<tabU.main>,…`, 5 s timeout.
  - `use("db")` and `use("user")` wait for it, up to 5 s, then resolve `null`.
  - A response of `{"signedIn":false}` → anonymous behaviour, and the bridge clears `sh_hint`.
  - After the first signed-in prefetch: if `owner` is absent, set it to `publicId`.
  - `use("user")` → `{id: async () => "me", isOwner: async () => false}`.
- **`db.doc(path)`, `get()`, `set()`:** exactly as spec §4.5, including:
  - snapshot `exists` as a boolean **property**
  - `data()` returns deep copies
  - stub parts become `data: () => ({hub, upd})`
  - read-your-writes
  - handover of another tab's newer local record (never this tab's own record)
  - waiters that resolve only when the server **acknowledges** a flush carrying `upd ≥ obj.upd`
  - `freshen()`: payloads are rebuilt from `localStorage[progressKey(hubId)]` at flush time
- **Outbox:**
  - Driven by `policy` (`flushMs` anchored at the first unsent change; flush on hidden per `hiddenMinMs`).
  - `pagehide` and `freeze` always flush if dirty.
  - At most one request in flight.
  - Unload uses `fetch(keepalive)` when the body is ≤ 60,000 B. Otherwise it lazy-loads `/_sh/fflate.js` (once the pending body passes 48 KB) and gzips synchronously, falling back to a normal fetch.
  - Requests always carry `X-StudyHubs: 1` and `credentials: "same-origin"`.
- **Acknowledgement and error mapping** per spec §4.5:
  - 401 → `revoked`
  - 403 → `not_granted`
  - 400/404/422 `invalid` → `invalid_argument`
  - 422 `clock_skew` → `unavailable` + notice
  - 413 or per-part `too_large` → `quota_exceeded`
  - 429/503/5xx/network → `unavailable`, with backoff of 15 s doubling to 10 min, honouring `Retry-After` / `retryAt`
  - Any `get()` failure → `unavailable`.
  - After a background success, if `#syncPill` has class `mid`, rewrite it to `<span class="dot"></span>Synced to your account` with `class="pill ok"`.
- **BroadcastChannel `"studyhubs"`** message types:
  - `{type:"flush"}`: flush now.
  - `{type:"auth-changed"}`: hidden tabs reload; visible tabs show "Signed in — reload to sync" and reload on the next visibility change unless a mock run is in progress.
  - `{type:"logout"}`: set `loggedOut`, wipe, `location.reload()`.
- **Legacy (AI-901):**
  - The seed script calls `legacySeed(cfg)` **before** the hub reads storage. Signed in: if `remote.upd > sidecar`, write `raw` with the original `setItem` and set the sidecar to `remote.upd`. Otherwise, if local exists and is newer, queue part `legacy`.
  - Wrapped `setItem` on the legacy key → sidecar = `Date.now()` and queue `legacy`.
  - Mid-session: on becoming visible after `refreshMs`, GET with `known=legacy:<sidecar>`. If the remote is newer, show a "Reload" notice; never reload automatically.
- **Chrome when signed in:**
  - The "Sign in" item becomes the user's initial with a menu: Account (`/account`), Sign out (`/signout`).
  - Notices: sync paused (with the local reset time), session ended (→ sign in), clock ahead, account mismatch, maintenance.
- **Shared module `src/local-progress.ts`** is imported directly by the client (Vite `server.fs.allow` + alias `@bridge-shared`).
  - It must stay pure: no DOM or global side effects at import time; storage is passed in as a `Storage`-like argument.
  - Exports the client relies on: the existing helpers plus
    - `wipeKeys(storage, legacyKeys)`: removes `keysToWipe` but **keeps `studyhub.codeLang` and `studyhubs.ui.*`**
    - `localHubParts(storage, hub:{id,engine,legacyKeys}) -> {[part]: payload}` for dirty parts only
    - `markSynced(storage, hubId, part, upd)`
    - `readOwner(storage)` / `writeOwner(storage, publicId)`

## 14. Client (M1)
- **Firebase:** `firebase@12.19.0`, lazy-loaded only on `/signin`, `/signup`, `/reset`, `/verify` and `/account`.
  - `initializeAuth(app, {persistence: inMemoryPersistence, popupRedirectResolver: browserPopupRedirectResolver})`.
  - Config comes from `GET /api/config`.
  - In `authMode:"fake"` the SDK is never loaded. `/signin` shows a "Test sign-in" form (uid, email, verified checkbox) that posts a `fake:` token.
- **Pages:**
  - `/signin?next=`: Google popup button + email/password form, generic error messages.
  - `/signup`: create account, `updateProfile`, `sendEmailVerification({url: origin + "/verify"})`, then show "check your email".
  - `/reset`: `sendPasswordResetEmail`, 60 s cooldown, generic message.
  - `/verify`: "I've verified" button; reloads the user, gets a fresh ID token and creates the session; resend with cooldown.
  - `/signout`: the flow in spec §4.6 step 7.
  - `/account` (M1 minimal): email, provider, publicId-free; local progress per hub with synced/dirty state; "Sign out"; the account-mismatch resolution ("Discard this browser's progress" after confirm); placeholders for M2 export/delete.
- **Sign-in completion** (spec §4.6 step 6):
  1. `POST /api/auth/session`.
  2. If `owner` exists, differs from the new `publicId` and local data is dirty: dialog [Download it as a file] [Discard and continue], then wipe.
  3. `reconcileUp`: one or more `POST /api/sync` calls with every hub's dirty parts, batched ≤ 1 MiB, gzip via `CompressionStream` when available. Then `markSynced` the accepted/duplicate/stale results.
  4. `writeOwner(publicId)`.
  5. Broadcast `auth-changed`.
  6. `location.assign(next)`. `next` must match `^/(h/[a-z0-9-]+)?$` or a known SPA route, else `/`.
- **Header:** user initial + menu (Account, Sign out) from a `MeProvider` around `/api/me`.
- **Budgets:** main ≤ 90 KB gz, Firebase chunk ≤ 80 KB gz.

## 15. Test-only routes (mounted only when `APP_ENV=test`)
- `POST /api/test/faults {op:"get"|"put"|"any", status, code, retryAfter?, count?}`: the next N progress/sync calls fail as specified.
- `POST /api/test/clock {offsetMs}`: shifts the server clock (skew tests).
- `POST /api/test/quota {writes?, reads?}`: sets today's meter (tier tests).
- `POST /api/test/reset`: wipes the memory store, meters, rate limits and faults.
- `GET /api/test/store`: dump of users and decoded progress `{uid, hub, part, upd, data}` plus usage.

All require `X-StudyHubs: 1`. They are never mounted outside test (a unit test asserts this).

## 16. M1 e2e scenarios (`site/e2e/tests/sync-*.spec.ts`; fake auth + memory store)
- **S3:** signed-in sync, with the single-request coalescing count.
- **S4:** remote newer than local is adopted.
- **S5:** anonymous progress merges on first sign-in (both via the hub on reload and via `reconcileUp`).
- **S6:** fault matrix (503, 429 `sync_paused`, 401, 413) → the right pill, toast and notice, no data loss, and recovery.
- **S8:** cost — 10 answers at learner pace give ≤ 2 sync requests at tier 1. Close right after an answer → the server has the latest (keepalive). A large state (> 60 KB) is sent gzipped.
- **S9:** AI-901 legacy round trip across two browser contexts.
- **S10:** logout wipes hub keys (keeps `studyhub.codeLang`), and the server keeps the data. Signing back in restores it.
- **S12:** a scripted session (`page.clock`) stays within the write budget per tier.
- **S13:** account switch on one browser → the dialog. No cross-uid write ever reaches the store (checked through `/api/test/store`).
- **S14:** device clock +1 day → notice, nothing stored.
- **S16:** quota at budget → "Sync paused", no "storage full" toast, a reset-time notice, and the outbox drains after `/api/test/reset`.
- **Every M0 spec must still pass.**
