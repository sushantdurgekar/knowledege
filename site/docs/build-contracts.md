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
- One classic IIFE (ES2019), ≤ 16 KB gzipped (M0 was ≤ 14 KB; M1 sync raised it). Built with esbuild from TypeScript.
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
| `AUTH_MODE` | `firebase` in production, `fake` in test/development | `fake` is **refused** when `APP_ENV=production`, and with `STORE=firestore` unless `FIRESTORE_EMULATOR_HOST` is set (`APP_ENV=test` with `STORE=firestore` needs the emulator too) |
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
  - Request-level errors: 401 `unauthenticated`, 403 `csrf`/`email_unverified`, 404 unknown hub, 409 `account_changed`, 413 `too_large` (body), 422 `invalid`/`clock_skew`, 429 `rate_limited`/`sync_paused` (with `retryAt` ISO + `Retry-After`), 503 `maintenance`/`unavailable`.
  - Rate limit: 12/min burst 6 per uid, plus `USER_WRITES_PER_DAY`.
- **Account binding** (`/api/progress` and `/api/sync`): a request may carry `X-StudyHubs-Account: <publicId>`, the account the hub page belongs to. When it differs from the session's publicId (another account signed in from another tab), the answer is 409 `account_changed` and nothing is read or written. Requests without the header (the site shell) are unaffected.
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
    - `usage/{YYYY-MM-DD}` (Pacific day), holding `reads, writes, deletes, fsEgress, appEgress` via `Increment`. Monthly totals (egress) are summed from the daily docs, so there is no separate monthly doc (it would double the meter writes)
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
  - **Account binding:** after the prefetch (or the legacy seed) every request carries `X-StudyHubs-Account` = the publicId the server named. A 409 `account_changed` stops sync for the page for good, turns the logout guard on and shows "You signed in with another account — reload this page".
- **Acknowledgement and error mapping** per spec §4.5:
  - 401, 409 `account_changed` → `revoked`
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

---

# M2: admin, account, maintenance, backups

These sections are binding for M2. Where they are silent, follow [architecture-spec.md](architecture-spec.md):
- §4.7 for the API
- §4.9 for meters
- §4.10 for the backup format and scheduler
- §4.11 for pages

Restore (upload, validate, apply) is **M3**; M2 only writes backups.

## 17. Admin authorization (plan §9 trims apply)
- **Admin:**
  - The session's email is in `ADMIN_EMAILS` (comma-separated, case-insensitive), `email_verified` is true and the provider is `google.com`.
  - Admin routes re-verify the session with `check_revoked=True` (cached at most 60 s).
  - Not admin → 404 `not_found`, which hides that the route exists.
- **Destructive actions:** creating a backup, entering `full` maintenance, deleting a scheduled job, and `DELETE /api/me` need:
  - `auth_time` within 24 h (otherwise 403 `reauth_required`; the client sends the user to `/signin?next=…`), and
  - a typed confirmation in the body (`confirm` must equal the exact phrase the UI shows).

  There is no `X-Reauth` header.
- **New env:** `ADMIN_EMAILS` (empty = no admins), `ADMIN_TZ` (default `Asia/Kolkata`), `DATA_DIR` (default `/tmp/studyhubs`; only scratch files live there), `JOB_GRACE_MIN=60`, `MAX_BACKUP_BYTES=2147483648`.

## 18. Account API (user session; CSRF on non-GET)
- **`GET /api/me/progress`** → `{"hubs":[{"hub","slug","title","parts":{"<part>":{"upd","bytes"}},"done":n}]}`.
  - One id-range query with a field mask: 1 read per doc.
  - Hubs missing from the catalog are still listed, with `slug: null`.
- **`GET /api/me/export`** → a JSON attachment `studyhubs-export-<YYYYMMDD>.json`: `{"exportedAt","user":{…no uid…},"progress":[{"hub","part","upd","data"}]}`. Rate limit 5/h.
- **`DELETE /api/me`** `{confirm:"DELETE"}`, with a sign-in within 24 h. Rate limit 3/h. Steps, each safe to repeat:
  1. Write tombstone `sha256("studyhubs-tombstone-v1:"+uid)` (first, so no sync can recreate a doc after step 2).
  2. Delete all progress docs.
  3. Delete the user doc.
  4. Delete the Firebase Auth user (fake mode: no-op).
  5. Clear cookies.
  6. Return 204.

  The client then wipes local hub data (`wipeKeys`) and broadcasts `logout`.
- **No re-sync under a deleted account:** another device keeps a valid session cookie (normal requests use `check_revoked=False`). When `put_parts` finds no hub document yet, it also reads the uid's tombstone in the same transaction (+1 read on a hub's first write only; 0 when the doc exists); if present it writes nothing and raises `AccountDeleted`, and `POST /api/sync` answers 401 `unauthenticated`, clears both cookies (the bridge maps 401 → `revoked`, the hub goes browser-only) and remembers the uid in-process, so that instance's next `GET /api/progress`/seed is `signedIn:false` with no read. GET itself does not check tombstones (a missing doc is the normal first visit; the check would cost a read there).

## 19. Admin API (all `GET`/`PUT`/`POST` under `/api/admin`, admin only)
- **`GET /api/admin/stats`:** the shape in spec §4.9, without the `host.instanceHoursMonth` and `migrationTriggers` fields if they can't be computed.
  - It must include: `store`, `users` (`count()` aggregation, 1 read per 1,000), `quotaDay {day, resetsAt, resetsAtLocal}`, and `firestore {writes, reads, deletes {used, limit}, storage {estBytes, limit, asOf}, egressMonth}`.
  - It also includes `host {egressMonth {bytes, limit}, rssBytes, ramLimit}`, `maintenance`, `jobs` (next 10), `lastBackup`, and the tier and policy.
  - The storage estimate comes from summing `n_*` at the last backup or a manual "Recount" (`POST /api/admin/stats/recount`, 1 read per doc; refused if it would use more than 20% of today's reads).
- **`GET/PUT /api/admin/maintenance`:** `{mode:"off|read_only|full", message, until}`, stored in `meta/settings` with optimistic `version`. `MAINTENANCE_FORCE` overrides it. `full` needs the destructive-action rules. Every instance re-reads settings at most every 60 s, and immediately after its own PUT.
- **`GET/PUT /api/admin/settings`:** `{tz, notice}`.
- **Jobs (maintenance windows only in M2; restore jobs are M3):**
  - `POST /api/admin/jobs {kind:"maintenance", mode:"read_only"|"full", startAt (ISO or "tonight"), tz, durationMin, message}`. `"tonight"` means 00:00 in `tz`.
  - `GET /api/admin/jobs`, `GET /api/admin/jobs/{id}`, `POST /api/admin/jobs/{id}/cancel`.
  - States: `scheduled → running → succeeded | failed | cancelled | missed`.
  - Store: `jobs/{id}` docs (Firestore) and a dict (memory). `claim_job` is atomic (transaction).
- **Scheduler** (`app/jobs/scheduler.py`):
  - An asyncio task ticking every 20 s, with jobs cached and refreshed every 5 min (at most 288 reads/day) and right after admin edits.
  - At T−10 min, `/api/me` and progress responses carry `upcoming {mode, startAt, message}`.
  - A job more than `JOB_GRACE_MIN` late becomes `missed` (with a banner) and does not run.
  - A maintenance job sets the mode at `startAt` and restores the previous mode at `startAt + durationMin`.
  - Survives restarts: on boot it re-reads jobs; a `running` job whose end time has passed is finished.
- **Backups:**
  - `GET /api/admin/backups/estimate` → `{users, docs, tombstones, estReads, readsLeftToday, fits}`.
  - `POST /api/admin/backups {passphrase?: string ≥ 12 chars | null, requireReadOnly: bool, confirm:"BACKUP"}` → `{ticket, filename, expiresIn:120}`.
    - 409 `quota` if the estimated reads exceed today's remaining reads minus a 20% reserve.
    - If `requireReadOnly`, the server enters `read_only` maintenance for the run and restores the previous mode afterwards; the header then says `consistent: true`.
  - `GET /api/admin/backups/{ticket}` (single use, admin cookie) → streamed `.backup`.
  - `GET /api/admin/backups/log` → `[{at, bytes, fileSha256, counts, encrypted, consistent}]`, the last 20, kept in `meta/backups`.

## 20. `.backup` v1 format (`app/backup/format.py`, `writer.py`, `crypto.py`; reader in M3)
- **Framing:**
  - `"SHBK"` (4 bytes), version `1` (1 byte), flags (1 byte; bit 0 = encrypted).
  - A u32 BE header length, then the header JSON (UTF-8, no secrets), then the body.
- **Header:** `{"format":"studyhubs-backup","v":1,"createdAt","app":{"version","commit"},"source":{"store","project","origin"},"consistent":bool,"compression":"gzip","encryption":null|{"alg":"AES-256-GCM-STREAM-1","kdf":"scrypt","n":32768,"r":8,"p":1,"salt":b64(16),"noncePrefix":b64(7),"segment":1048576},"estimated":{"user":n,"progress":n}}`.
- **Body, unencrypted:** one gzip stream of NDJSON records, in this order:
  - `settings` (whitelisted keys `tz`, `notice` only; never maintenance, jobs or secrets)
  - `tombstone` (`{t,h,at}`)
  - `user` (`{t,uid,email,emailVerified,name,photo,provider,createdAt,lastLoginAt}`)
  - `progress` (`{t,uid,hub,part,upd,data}` with `data` the exact payload object)
  - and finally `{"t":"end","counts":{…},"sha256":"<hex of all preceding lines incl. \n>"}`.
- **Body, encrypted:**
  - Frames of `[u32 BE len][ciphertext‖16-byte tag]`, each over a 1 MiB segment of the gzip stream.
  - Nonce = `noncePrefix(7) ‖ u32 BE counter ‖ last-flag(1)`.
  - AAD = `SHA-256(magic‖version‖flags‖headerLen‖headerJSON)`.
  - Key = `cryptography` `Scrypt(salt, length=32, n=2**15, r=8, p=1)` over the NFKC passphrase.
- **Writer:** a sync generator (cursor pages by document id, never offsets → lines → running sha256 → `zlib.compressobj(6, wbits=31)` → optional framer). Memory ≤ one page + 2 MiB. The file's sha256 is computed while streaming and logged.
- **`scripts/backup_tool.py inspect|verify|decrypt <file>`:** offline (verify checks counts, the `end` sha256 and, if encrypted, every frame tag). Also used by the tests.
- Add `cryptography` (pinned, hash-locked) to the requirements.

## 21. Client (M2)
- **`/account`:**
  - Profile (email, provider, joined).
  - Server progress per hub (`/api/me/progress`) next to local progress and synced state.
  - "Download my data" (`/api/me/export`).
  - "Delete my account": type DELETE; on `reauth_required` → `/signin?next=/account`; on success → `wipeKeys` + broadcast `logout` + `/`.
  - The browser storage panel (local bytes per hub, and "remove local copy" only for fully synced hubs).
- **`/admin`** (lazy chunk; shown in the menu only when `/api/me` returns `user.admin: true`). Tabs:
  - **Overview:** meter bars `--good` < 50%, `--trap` < 80%, `--bad` otherwise; the next quota reset in IST and Pacific; users; last backup.
  - **Backup:** the estimate, an optional passphrase (≥ 12 chars, shown once, "can't be recovered" warning), "Use read-only maintenance during backup" (checked by default), typed confirmation, the download via ticket, and the log.
  - **Maintenance & schedule:** the current mode, set the mode, schedule a window with the "Tonight 00:00" preset in `ADMIN_TZ`, the jobs list with cancel.
  - **Settings:** timezone and notice.
- **`/privacy`:** what is stored (local and server), why, retention, deletion and export, Firebase/Google as processors, and contact via the GitHub repo owner (no email address).
- **Budgets:** main ≤ 90 KB gz; the admin chunk ≤ 40 KB gz.

## 22. Tests (M2)
- **Server:**
  - admin predicate matrix
  - destructive-action rules
  - stats shape
  - maintenance modes + `MAINTENANCE_FORCE`
  - scheduler with an injected clock: due, grace/missed, restart, end restores the previous mode
  - backup round-trip, plain and encrypted, through `backup_tool.py verify`: a flipped byte, truncation, a reordered frame, extra trailing bytes and a wrong passphrase must all fail
  - a backup of 20k synthetic docs stays under 300 MB peak RSS (memory store), with a separate test for the Firestore emulator streaming path
  - delete-account cascade + tombstone
  - export shape
  - the contract suite extended to `list_hubs`, `delete_user`, the `iter_*` methods (1,234 docs, page 100: exact, ordered, no duplicates) and `claim_job` exclusivity
- **E2E (`m2-*.spec.ts`, serial project):**
  - admin overview renders for an admin fake user and 404s for others
  - set `read_only` → the hub shows "Sync paused" and saves locally; `off` → it drains
  - a scheduled window with a near `startAt` fires (test clock)
  - backup download → `backup_tool.py verify` passes
  - account export and delete (cookies cleared, local wiped, `/api/test/store` empty for that uid)

---

# M3: Postgres store and restore

Binding for M3. Where these sections are silent, follow [architecture-spec.md](architecture-spec.md): §4.8 for the Postgres DDL and operations, §4.10 for restore. AWS compose and the runbook are M4.

## 23. Postgres store
- **Configuration:**
  - `STORE=postgres` + `DATABASE_URL` (postgresql://…), `PG_POOL_MAX=5`.
  - Driver: `psycopg[binary,pool]` 3, pinned and hash-locked.
  - With `STORE=postgres` the defaults become `QUOTA_ENFORCE=0` and `SYNC_TIERS=1:30:0:30` (a 30 s flush).
- **Schema:**
  - `app/store/sql/0001_init.sql` follows spec §4.8 (users, progress with `bytea` gzip data, tombstones, settings, jobs, usage, plus the unlogged import tables).
  - It is applied at startup under `pg_advisory_lock(842001)` and tracked in `schema_migrations`.
- **Behaviour:** the full `Store` protocol with the same semantics as memory/Firestore.
  - `put_parts` runs as one transaction:
    1. `SELECT … FOR UPDATE` of the hub's stamps.
    2. Run `decide`.
    3. Upsert, guarded by `WHERE progress.upd < EXCLUDED.upd`.
    4. Check the tombstone only when the hub has no rows.
  - `claim_job` is a conditional `UPDATE … RETURNING`.
- **Local and CI testing:**
  - `site/scripts/dev_pg.sh` runs `initdb` + `pg_ctl` in a temp dir on port 54329, and prints the URL.
  - The contract suite is parametrized over memory, postgres (skipped unless `DATABASE_URL_TEST` is set; required when `REQUIRE_PG=1`) and the Firestore emulator.
  - CI adds a `postgres:16` service to the contract job.

## 24. Restore API (admin; CSRF; destructive rules from §17 where noted)
- **`POST /api/admin/restore/uploads {name, size, lastModified}`** → `{uploadId, chunkSize:4194304, received:[]}`.
  - Staging lives in `DATA_DIR/restore/<uploadId>/`.
  - Uploads are capped at `MAX_BACKUP_BYTES`, with one upload active at a time.
- **`PUT /api/admin/restore/uploads/{id}/chunks/{n}`:** raw body ≤ 4 MiB with `X-Chunk-SHA256`. Idempotent; writes the chunk at its offset.
- **`GET /api/admin/restore/uploads/{id}`** → `{state:"uploading|assembled|validating|validated|invalid", received, size, report?}`.
- **`POST /api/admin/restore/uploads/{id}/validate {passphrase?}`** → 202; poll the GET. Validation is read-only against the target and covers:
  - magic/version, the exact v1 encryption parameters and every frame tag
  - gunzip, then each line's schema
  - counts and the `end` sha256
  - then writes a decrypted `ready.ndjson.gz` and **drops the passphrase**
  - a plan against the target: users new/existing; progress parts newer/older/identical; tombstoned uids skipped. Firestore targets also get `estWrites`, `daysNeeded` (20k writes/day) and `fitsToday`.

  A wrong passphrase, tampering or truncation → `invalid`, before any write.
- **`DELETE /api/admin/restore/uploads/{id}`:** wipes staging.
- **`POST /api/admin/jobs {kind:"restore", uploadId, mode:"merge"|"replace", runAt:"now"|"tonight"|"after_quota_reset"|ISO, tz, exitMaintenanceOnSuccess:true, confirm}`:**
  - Destructive rules apply. `confirm` is `"RESTORE"` for merge and `"REPLACE <users> USERS"` for replace.
  - `replace` on Firestore is refused (409 `unsupported`); use merge.
- **Restore job:**
  1. Claim the job atomically.
  2. Enter `full` maintenance, remembering the previous mode.
  3. Stream from `checkpoint.line + 1` in batches (≤ 500 records or 4 MiB):
     - **Postgres:** one transaction holds the users + progress upserts (newest-wins via `decide`) and the jobs checkpoint update, so each batch applies exactly once.
     - **Firestore:** a `WriteBatch` of ≤ 400 docs / 8 MiB, with the checkpoint doc in the **same** batch; throttled from 50 ops/s, +50% every 5 min. Quota → `paused_quota`, resuming at the Pacific reset + 5 min.
  4. Skip tombstoned uids, both those in the backup and those in the target.
  5. `replace` (Postgres): COPY into the import tables, then one swap transaction checks the counts and runs `TRUNCATE progress, users CASCADE` + `INSERT … SELECT`.
  6. Heartbeat every 20 s. At boot, a `running` job whose heartbeat is more than 2 min old is reclaimed and resumed.
  7. Verify: counts written + kept-newer + skipped = the `end` counts; then re-read a 1% sample (≤ 200 parts) and compare hashes.
  8. Success: delete staging, then restore the previous mode if `exitMaintenanceOnSuccess`. Failure: stay in `full`, the job goes to `needs_attention`, and the admin sees a banner.
- **Job states:** `scheduled → running → (paused_quota → running)* → succeeded | needs_attention | failed | cancelled | missed`.
- **Render free note:** `DATA_DIR` is ephemeral there. The README must say to upload, validate and run the restore in one sitting (or on AWS, where `/data` is a volume).

## 25. Client (M3)
Admin **Restore** tab, a wizard:
1. **Pick a file:** read the first 64 KiB in the browser to show the header (source, created, encrypted, estimated counts).
2. **Upload:** 4 MiB chunks with SHA-256 from `crypto.subtle`, a progress bar, and resume after a reload (keyed by name + size + lastModified in `studyhubs.ui.restore`).
3. **Validate:** a passphrase field if the file is encrypted; then the plan report.
4. **Choose:**
   - mode: merge (default), or replace (Postgres only)
   - time: Now / Tonight 00:00 (in `ADMIN_TZ`) / After the next Firestore quota reset (Firestore only)
5. **Confirm:** type the phrase the page shows.
6. **Watch the job:** progress `{done,total}`, state and report; cancel while it is still scheduled.

Budget: the admin chunk stays ≤ 40 KB gz.

## 26. Tests (M3)
- **Contract suite on Postgres:** every existing case, plus `restore_batch` atomic with its checkpoint, and idempotent.
- **Server:**
  - upload chunk idempotency, resume and sha mismatch
  - validate rejects the full tamper matrix + a wrong passphrase before any write
  - plan counts
  - merge vs replace results
  - tombstone skips
  - quota pause/resume (Firestore emulator, small injected quota)
  - **S17:** a backup taken from a memory-store instance restores into a Postgres instance with a clean report and an identical decoded state
  - **S18:** kill the worker process (`-9`) mid-apply, restart, and resume to an identical final state
- **E2E (`m3-restore.spec.ts`, serial):** the admin restore wizard end to end against a Postgres-backed server: upload a backup produced by the app, validate, run "Now", succeed, and confirm a synced hub shows the restored progress.
