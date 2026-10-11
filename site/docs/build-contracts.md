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
- `catalog.internal.json` adds `source` (repo-relative path), `csp` (the full header value), and `servedSha256`.
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

## 5. Server routes (M0)
| Route | Behaviour |
|---|---|
| `GET /healthz` | `{"ok":true}`, `no-store`, no DB |
| `GET /api/version` | `{"version":"0.1.0","commit":"<GIT_COMMIT or RENDER_GIT_COMMIT or 'dev'>"}` |
| `GET /api/me` | M0: `{"signedIn":false}` (M1 adds auth) |
| `GET /api/seed/{hubId}.js` | Anonymous M0 body: `window.__studyhubsBridge&&__studyhubsBridge.legacySeed({signedIn:false});` with `Content-Type: text/javascript`, `Cache-Control: no-store`, `Vary: Cookie`. Unknown or non-legacy hub: 404 JS comment |
| `GET /catalog.json` | Precompressed public catalog, `max-age=300, stale-while-revalidate=86400` |
| `GET /h/{slug}` | Served variant. Content negotiation br > gzip > identity, strong ETag per encoding, 304 on `If-None-Match`, `Vary: Accept-Encoding`, `Cache-Control: public, max-age=300, stale-while-revalidate=86400`, per-hub CSP from the internal catalog. `/h/{slug}/` → 301 to `/h/{slug}`. An id used as slug → 301 to the slug. Unknown → 404 HTML page |
| `GET /h/{slug}/download` | Original bytes. `Content-Disposition: attachment; filename="<ascii fallback>"; filename*=UTF-8''<pct-encoded downloadName>`, `Content-Security-Policy: sandbox`, `max-age=3600`, ETag = sha256 |
| `GET /_sh/{file}` | bridge.js / fflate.js precompressed, `max-age=600, stale-while-revalidate=86400`, ETag |
| `GET /assets/*` | `public, max-age=31536000, immutable` |
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
  - A small floating pill at bottom-left in a closed shadow root. It follows the hub theme (`data-theme` / `prefers-color-scheme`), is safe-area padded and hidden in print.
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
