# Study Hubs website

This folder holds the public website for the vault's Study Hubs. Every `*-hub.html` and `*Study Hub.html` file in `technical/` is published at `/h/<slug>`. Anyone can study without an account, and progress stays in the browser's `localStorage`, as it does when a hub is opened from disk.

The hub files are **never edited**. The server adds one `<script>` (the *bridge*) before `</head>`. The bridge answers the hub's `window.claude` calls and adds a small floating menu. The download link always serves the original file, byte for byte.

**Milestone M0 (static site)** is the current scope: hubs, catalog, downloads, the anonymous bridge and the AI notice. Accounts and sync arrive in M1, admin tools in M2, Postgres and restore in M3. See [docs/implementation-plan.md](docs/implementation-plan.md).

| Doc | What it is |
|---|---|
| [docs/implementation-plan.md](docs/implementation-plan.md) | Agreed scope, decisions and milestones |
| [docs/build-contracts.md](docs/build-contracts.md) | **Binding** interfaces between the parts (layout, commands, catalog, injection, routes, bridge, client) |
| [docs/architecture-spec.md](docs/architecture-spec.md) | Full engineering spec (M0–M4) |
| [docs/hub-runtime-contract.md](docs/hub-runtime-contract.md) | What each hub expects at runtime, with line references |
| [docs/bridge-prototype-findings.md](docs/bridge-prototype-findings.md), [docs/prototype/](docs/prototype/) | Prototype bridge and mock server, tested on real hubs |

## How it fits together

```
 vault (git)                      build (Docker stage "web", Node 22)          runtime (Render, 1 container)
 ───────────                      ──────────────────────────────────          ─────────────────────────────
 technical/**/hubs/*-hub.html ─┐   bridge/  ─ esbuild ──> public/_sh/bridge.js   FastAPI + uvicorn (Python 3.12)
 technical/certifications/     ├─> scripts/collect-hubs.mjs ──> build/           GET /             React catalog (public/)
   */*Study Hub.html          ─┘     inject 1 <script>, CSP hashes,               GET /h/<slug>     served hub (br/gz, ETag, CSP)
                                     br/gz, catalog.json                          GET /h/<slug>/download  original bytes
 site/** ────────────────────────> client/  ─ Vite ────> public/                  GET /catalog.json, /_sh/*, /api/*
```

- **Browser on `/h/<slug>`:** the hub runs as a top-level page. `bridge.js` runs first.
  - In M0, `use("db")` and `use("user")` resolve `null`, so the hub shows "Saved in this browser".
  - `use("sample")` resolves to an AI shim. Every AI button opens the "AI isn't supported here" notice, which offers **Download this hub**.
  - An anonymous visitor makes **zero** `/api` requests. The legacy AI-901 hub is the one exception: it loads its tiny seed script.
- **Collector** (`scripts/collect-hubs.mjs`):
  - Discovers hubs with the two globs in `hubs.config.json`.
  - Lints them (no emails or API keys).
  - Injects the bridge and checks that the served file minus the injection equals the original.
  - Hashes the inline scripts into a per-hub CSP.
  - Precompresses everything and writes `catalog.json`.
- **Docker build context:** the root [`.dockerignore`](../.dockerignore) is an allow-list. It admits only `site/**` and those two hub globs, so `_meta/`, `sessions/`, `practice/`, `work/` and courses never reach the builder.
  - The Dockerfile runs `scripts/verify-context.mjs` on what it copied.
  - CI runs `scripts/check-image.sh` on the final image.

```
site/
  Dockerfile  render.yaml  Makefile  hubs.config.json   build and deploy
  bridge/     TypeScript -> one IIFE (<= 14 KB gz)       see bridge/README.md
  client/     React + Vite catalog shell                 see client/README.md
  server/     FastAPI app, pytest                        see server/README.md
  scripts/    collector, context and image checks, dev-build.sh, dev-e2e.sh
  e2e/        Playwright acceptance tests (Chromium)
  docs/       plan, contracts, spec, prototype
  build/          generated: collector output    (git-ignored)
  server/public/  generated: client + bridge     (git-ignored)
```

## Local development

You need Node 22, Python 3.12 (3.13 works locally; the image uses 3.12), `make`, and a POSIX shell.

```bash
make -C site install     # npm ci for bridge, client and e2e; server venv from the hash-locked requirements
make -C site build       # bridge -> client -> collector (same order as the Dockerfile)
make -C site serve       # http://127.0.0.1:10000  (uvicorn --reload, APP_ENV=development)
```

You can also run `sh site/scripts/dev-build.sh` from any directory. It installs missing dependencies, then builds everything and the server venv. Add `--install` to force a fresh `npm ci`/`pip install`, or `--strict` to fail on any rejected hub.

**Working on the catalog UI:**
1. Keep `make -C site serve` running.
2. Run `cd site/client && npm run dev`.
3. Open http://localhost:5173. Vite proxies `/api`, `/h/*`, `/_sh` and `/catalog.json` to the backend.

**After editing a hub** in the vault, run `make -C site collect`, then reload `/h/<slug>`.

### Commands

| Command | What it does |
|---|---|
| `make -C site help` | List all targets |
| `make -C site build-bridge` / `build-client` / `collect` | One build step (`collect STRICT=1` fails on a rejected hub) |
| `make -C site test` | Every unit suite: bridge (tsc + vitest), client (vitest), collector (`node --test`), server (ruff + pytest) |
| `make -C site e2e` | Playwright suite. It starts uvicorn on `PORT` (default 10000) unless `BASE_URL` already answers, then stops it |
| `make -C site e2e-smoke` | The fast `@smoke` subset (HTTP contract, catalog), about 3 s |
| `make -C site lint` | Type-check the e2e suite and lint the server |
| `make -C site docker` | Build the image and run `check-image.sh` on it (needs a Docker daemon) |
| `make -C site clean` | Delete `build/`, `server/public/` and Playwright output |

The raw commands behind these targets are in [build-contracts.md §2](docs/build-contracts.md).

### End-to-end tests (`e2e/`)

The suite runs against a live server. It reads the server's `/catalog.json` and generates tests for **every** hub. It checks the following:

| Check | What it covers |
|---|---|
| Catalog | The catalog lists every hub, and its Open/Download links work |
| Local progress | A module marked done in a hub shows on the catalog card |
| Hub pages | Zero console, page or CSP errors while every tab is clicked |
| Bridge | The bridge boots and the floating menu has the right links |
| Anonymous mode | "Saved in this browser", progress in `localStorage`, no `/api` calls |
| Nudge | Appears after the first progress and stays dismissed |
| AI paths | Every AI path (Explain, Teach-back, Tutor, Fresh questions) opens the notice, and its Download button saves the original file |
| Byte-exact serving | The served page minus the injected span equals the original. The download's sha256 matches the catalog |
| Caching | 304 on revisit, via `If-None-Match` and a real browser reload |
| Security | Security headers and the per-hub CSP |
| M0 API | The `/api` routes, redirects and 404s |

The bridge's modal and menu sit in **closed** shadow roots. Tests reach them through the Chrome DevTools Protocol (accessibility tree and real mouse clicks; see `e2e/tests/support/shadow.ts`). Google Fonts is stubbed with an empty stylesheet, so runs are offline-safe and deterministic.

```bash
sh site/scripts/dev-e2e.sh                       # whole suite (~30 s, 4 workers)
sh site/scripts/dev-e2e.sh --grep @smoke         # HTTP contract only
sh site/scripts/dev-e2e.sh tests/ai.spec.ts      # one file
cd site/e2e && BASE_URL=https://study-hubs.onrender.com npx playwright test --grep @smoke   # a deployed site
```

| Variable | Default | Meaning |
|---|---|---|
| `BASE_URL` | `http://127.0.0.1:10000` | Server under test |
| `E2E_EXPECT_HSTS` | `1` for https, else `0` | Whether `Strict-Transport-Security` must be present (production only) |
| `E2E_EXPECT_SLUGS` | the 7 current slugs | Comma list that must be in the catalog; empty disables the check |
| `E2E_WORKERS` | 4 (2 in CI) | Parallel browsers |

Playwright uses `PLAYWRIGHT_BROWSERS_PATH` when it is set, and `/opt/pw-browsers` when that folder exists. Otherwise, install Chromium once with `cd site/e2e && npx playwright install chromium`.

## Environment variables

**M0 (used now):**

| Variable | Default | Notes |
|---|---|---|
| `APP_ENV` | `development` (image: `production`) | `development`, `test` or `production`. HSTS is sent only in production |
| `PUBLIC_ORIGIN` | `http://127.0.0.1:10000` | Exact public origin (`https://host`, no path). Production warns if it is not https |
| `PORT` | `10000` | Render injects it |
| `PUBLIC_DIR` | `site/server/public` (image: `/app/public`) | React build + `_sh/` |
| `HUBS_DIR` | `site/build` (image: `/app/build`) | Collector output |
| `GIT_COMMIT` / `RENDER_GIT_COMMIT` | `dev` | Reported by `/api/version`, which the deploy job waits for |
| `LOG_LEVEL` | `INFO` | |

**Later milestones (placeholders):** these are listed in [architecture-spec.md §4.12](docs/architecture-spec.md) and commented in [render.yaml](render.yaml).
- **M1:** `STORE`, `AUTH_MODE`, `SECRET_KEY`, `SESSION_DAYS`, `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_CONFIG`, `GOOGLE_APPLICATION_CREDENTIALS` (a Render Secret File), and the `SYNC_*`/`QUOTA_*` tuning.
- **M2:** `ADMIN_EMAILS`, `ADMIN_TZ`, `DATA_DIR`, `MAINTENANCE_FORCE`.
- **M3/M4:** `DATABASE_URL` and the backup settings.

## Deploy on Render

The site runs as **one free Docker web service in Singapore**. CI deploys it through a deploy hook after all tests pass. Render never auto-deploys.

### 1. Create the service

**Option A: Blueprint (preferred).**
1. In Render, go to **New → Blueprint** and connect the GitHub repo.
2. Set **Blueprint Path** to `site/render.yaml`.
3. Apply. Render creates the `study-hubs` service with every setting below.

**Option B: by hand.** Use this if your workspace can't use a Blueprint under `site/`. Go to **New → Web Service**, pick the repo, then set:

| Setting | Value |
|---|---|
| Language / Runtime | Docker |
| Branch | `main` |
| Region | Singapore |
| Instance type | Free |
| Root Directory | *(empty: the repo root)* |
| Dockerfile Path | `./site/Dockerfile` |
| Docker Build Context Directory | `.` |
| Health Check Path | `/healthz` |
| Auto-Deploy | Off |
| Environment | `APP_ENV=production`, `PUBLIC_ORIGIN=https://<your-service>.onrender.com`, `LOG_LEVEL=INFO` |

**Then:**
1. Set `PUBLIC_ORIGIN` to the hostname Render actually assigned (the Blueprint asks for it at creation and never overwrites it). The name `study-hubs` may be taken, which gives `study-hubs-xxxx.onrender.com`.
2. Deploy once by hand (**Manual Deploy → Deploy latest commit**).
3. Check that `https://<host>/healthz` returns `{"ok":true}`.

### 2. Let CI deploy

1. In Render, go to **Service → Settings → Deploy Hook** and copy the URL. Treat it like a password.
2. In GitHub, go to **Settings → Secrets and variables → Actions**:
   - Add the **secret** `RENDER_DEPLOY_HOOK` = that URL.
   - Add the **variable** `PUBLIC_ORIGIN` = `https://<host>`. This is only needed if it is not `https://study-hubs.onrender.com`.
3. Every push to `main` that touches the site or a hub now runs [`.github/workflows/site.yml`](../.github/workflows/site.yml):

| Job | What it runs |
|---|---|
| `test` | Bridge build and vitest, client build (budgets) and vitest, collector tests, `collect --strict`, e2e type-check, ruff and pytest |
| `e2e` | Builds everything as `make build` does, runs the Playwright suite against uvicorn, builds the Docker image, runs `check-image.sh`, then smoke-tests the container in production mode |
| `deploy` | Main only, needs both jobs, skipped without the secret. It first checks that the commit is still the head of `main`; if not, the newer commit's run deploys. Then it calls the deploy hook and polls `PUBLIC_ORIGIN/api/version` until `commit` equals the tested SHA (10 min timeout), and finally checks `/healthz` and `/catalog.json` |

Commits that only touch notes match none of the workflow's paths, so they test and deploy nothing. Run **Actions → site → Run workflow** to redeploy by hand.

### 3. Keep it awake (UptimeRobot)

Render's free instances sleep after about 15 idle minutes, and the first visit then waits for a cold start. A free UptimeRobot monitor prevents this:

1. Go to https://uptimerobot.com → **Add New Monitor**.
2. Set the type to **HTTP(s)** and the URL to `https://<host>/healthz`.
3. Set **Monitoring Interval** to **5 minutes**.
4. Set an alert contact (your email).

`/healthz` never touches a database and answers `no-store`, so the pings cost nothing. Pinging every 5 minutes keeps the service up about 744 h a month, inside the 750 free instance-hours. That budget covers **one** always-on free service per workspace.

## Publishing a new hub

1. Save the hub in the vault under one of these two patterns:
   - Capability hubs: `technical/<domain>/<subject>/hubs/<subject>-l<1-4>-<label>-hub.html`, for example `technical/data-ai/genai/hubs/genai-l1-foundation-hub.html`.
   - Certification hubs: `technical/certifications/<exam>/<CODE> Study Hub.html`, for example `technical/certifications/az-104/AZ-104 Study Hub.html`.

   Paths containing `courses`, `docs`, `notes`, `work`, `_meta`, `sessions` or `practice` are always rejected.
2. Check it locally: run `make -C site collect STRICT=1` and read the summary or `site/build/build-report.json`.
   - The slug comes from the file name.
   - The engine is detected: `v2` for modern hubs, `legacy` only through `hubs.config.json`, otherwise `static` (served, local-only).
   - The publish lint fails on email addresses and API-key patterns. Allow false positives explicitly in `hubs.config.json` → `lintAllow`.
   - Then run `make -C site serve` and open `/h/<slug>`.
3. Commit the hub file to `main` (`learn(...)` or `chore(...)`, as usual) and push.
4. CI tests it, along with every other hub: no CSP violations, byte-exact serving, AI notice. The deploy hook then publishes it. The catalog picks it up automatically, and nothing in `site/` needs to change.

Optional per-hub overrides (code, cert name, blurb) go in `hubs.config.json` → `overrides`. A `.dockerignore` hub line must always equal `include` in `hubs.config.json`; a test checks this.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `/h/<slug>` returns 503 "not built" | The collector output is missing. Run `make -C site build` (or `collect`), or set `HUBS_DIR` |
| The catalog page is blank or `/` is 404 | The client build is missing. Run `make -C site build-client`. The bridge must be built first or `/_sh/bridge.js` is missing |
| E2E: "Cannot load …/catalog.json" | No server at `BASE_URL`. Use `sh site/scripts/dev-e2e.sh`, which starts one, or `make -C site serve` |
| E2E: "Executable doesn't exist" | No Chromium for Playwright 1.56.1. Run `cd site/e2e && npx playwright install chromium`, or set `PLAYWRIGHT_BROWSERS_PATH` |
| E2E: a CSP violation on one hub | The hub has an inline script the CSP doesn't hash. Rebuild with `make -C site collect`, then check `build-report.json` |
| Port 10000 already in use | `PORT=10001 make -C site serve`, or `PORT=10001 make -C site e2e` |
| A file you created never reaches git or the Docker build | The vault `.gitignore` ignores `build/`, `dist/`, `*.gz`, `*.png`, `secrets.*` and more repo-wide ([build-contracts.md §0](docs/build-contracts.md)). Check with `git check-ignore -v <file>` |
| `collect --strict` fails in CI | A hub was rejected (lint hit, duplicate id or slug, reserved slug). The log and `build-report.json` say which |
| The deploy job times out on `/api/version` | Check the Render dashboard for a failed or still-running build. If the live site reports commit `dev`, the deploy worked but Render passed no `RENDER_GIT_COMMIT` (check with `echo $RENDER_GIT_COMMIT` in the Render shell), so CI cannot confirm it. The Dockerfile accepts it as a build argument and the server reads it at runtime |
| The first visit after a while is slow | The free instance was asleep. Check that the UptimeRobot monitor is up and every 5 min |
| `check-image.sh` fails | Something private or unexpected reached `/app` (a `.md`, `_meta`, a non-catalog file under `hubs/`). Fix `.dockerignore` or the Dockerfile `COPY` lines; never widen the check |
