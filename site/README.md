# Study Hubs website

This folder holds the public website for the vault's Study Hubs. Every `*-hub.html` and `*Study Hub.html` file in `technical/` is published at `/h/<slug>`. Anyone can study without an account, and progress stays in the browser's `localStorage`, as it does when a hub is opened from disk.

The hub files are **never edited**. The server adds one `<script>` (the *bridge*) before `</head>`. The bridge answers the hub's `window.claude` calls and adds a small floating menu. The download link always serves the original file, byte for byte.

**Milestones M0 (static site), M1 (accounts and sync), M2 (admin, account data, maintenance, backups) and M3 (Postgres store, restore)** are built: hubs, catalog, downloads, the anonymous bridge and the AI notice, optional accounts (Firebase Auth: Google or email/password) whose progress syncs to Firestore (or Postgres) through the server, and an admin area with meters, maintenance windows, downloadable backups and a restore wizard; learners can export or delete their data. See [docs/implementation-plan.md](docs/implementation-plan.md) and, for setup, [M1: accounts and sync](#m1-accounts-and-sync), [M2: admin, backups and maintenance](#m2-admin) and [M3: restore from a backup](#m3-restore).

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
  - Anonymous (no `sh_hint` cookie): `use("db")` and `use("user")` resolve `null`, so the hub shows "Saved in this browser".
  - Signed in (M1): the bridge prefetches `GET /api/progress/<hubId>` and hands the hub a db whose writes go through an outbox that batches them into `POST /api/sync` (120 s at tier 1, always on hide or close). The pill shows "Synced to your account". The server writes Firestore with a service account; browsers never reach Firestore.
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
  bridge/     TypeScript -> one IIFE (<= 16 KB gz)       see bridge/README.md
  client/     React + Vite catalog shell                 see client/README.md
  server/     FastAPI app, pytest                        see server/README.md
  firebase/   Firestore rules + index exemptions, emulator config
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

**Accounts and sync locally (fake auth).** Outside production the server defaults to `AUTH_MODE=fake` and `STORE=memory`, so no Firebase project is needed:
1. `make -C site serve`, open http://127.0.0.1:10000/signin.
2. The page shows a **Test sign-in** form (user id, email, "Email verified"). Any user id signs in; untick "Email verified" to see the `/verify` detour. The Firebase SDK is never loaded in this mode.
3. Open a hub: the pill says "Synced to your account". Changes are batched (120 s at tier 1) and always sent when the tab is hidden or closed; `window.__studyhubsBridge.flushNow()` in the console sends them at once, and `__studyhubsBridge.stats()` shows the outbox.
4. Progress lives in the server process and is gone after a restart. With `APP_ENV=test` the test-only routes `/api/test/{faults,clock,quota,reset,store}` are mounted too ([build-contracts.md §15](docs/build-contracts.md)); `curl -H 'X-StudyHubs: 1' http://127.0.0.1:10000/api/test/store` dumps users and decoded progress.

**Store contract on the Firestore emulator** (Java 21 needed): run `make -C site emulator` in one terminal and `make -C site test-contract` in another. The same suite runs on the memory store in `make -C site test`.

**Postgres locally** (Postgres 16 binaries in `/usr/lib/postgresql/16/bin`, or set `PG_BIN`): `make -C site pg` starts a throwaway cluster on 127.0.0.1:54329 (`scripts/dev_pg.sh`: `initdb` in a temp dir, trust auth, fsync off) and prints its URL; `make -C site pg-stop` stops it and deletes its data.
```bash
make -C site pg                                   # postgresql://postgres@127.0.0.1:54329/studyhubs_test
make -C site test-contract REQUIRE_PG=1           # memory + emulator + Postgres (S17, S18 included)
make -C site e2e-pg                               # m3-restore.spec.ts on a Postgres-backed uvicorn (port 10010)
cd site/server && STORE=postgres DATABASE_URL=$(sh ../scripts/dev_pg.sh url) .venv/bin/uvicorn app.main:app --port 10000   # by hand
```
`test-contract` uses `DATABASE_URL_TEST` when it is set, else the running `make pg` instance; without either the Postgres cases are skipped (`REQUIRE_PG=1` makes that a failure, as in CI). The suite and `/api/test/reset` empty every table of that database.

### Commands

| Command | What it does |
|---|---|
| `make -C site help` | List all targets |
| `make -C site build-bridge` / `build-client` / `collect` | One build step (`collect STRICT=1` fails on a rejected hub) |
| `make -C site test` | Every unit suite: bridge (tsc + vitest), client (vitest), collector (`node --test`), server (ruff + pytest) |
| `make -C site e2e` | Playwright suite (M0-M3, memory store). It starts uvicorn on `PORT` (default 10000) unless `BASE_URL` already answers, then stops it |
| `make -C site e2e-pg` | `m3-restore.spec.ts` against uvicorn on Postgres (port 10010), starting `make pg` if it is not running; `ARGS=` runs other specs (`ARGS=--project=sync`) |
| `make -C site e2e-smoke` | The fast `@smoke` subset (HTTP contract, catalog), about 3 s |
| `make -C site emulator` | Firestore emulator on 127.0.0.1:8080 (`firebase-tools@15.31.0`, needs Java 21), in the foreground |
| `make -C site test-contract` | Store contract tests on memory, the running emulator (`FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`) and Postgres (`DATABASE_URL_TEST`, or the running `make pg`) |
| `make -C site pg` / `pg-stop` | Start (and print the URL of) / stop the throwaway Postgres 16 on 127.0.0.1:54329 |
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
| M1 sync (`sync-*.spec.ts`) | S3 one coalesced request, S4 newer remote adopted, S5 anonymous progress merged at first sign-in, S6 faults (503, 429, 401, 413), S8 cost and keepalive on close, S9 AI-901 across two devices, S10 sign-out wipe and restore, S12 write budget per tier under `page.clock`, S13 account switch, S14 device clock ahead, S16 quota at the budget ([build-contracts.md §16](docs/build-contracts.md)) |
| M1 client | Test sign-in, `next` handling, header menu, `/verify` detour, `/signout` |
| M2 (`m2-*.spec.ts`) | Admin overview for an admin and 404 for everyone else; `read_only` → "Sync paused" and local saves, `off` → the outbox drains; a scheduled window fires and ends on the test clock; a backup downloaded through its ticket passes `backup_tool.py verify` (plain and encrypted); account export, delete (cookies, local data, store) and the 24 h re-sign-in ([build-contracts.md §22](docs/build-contracts.md)) |
| M3 (`m3-restore.spec.ts`) | The restore wizard end to end: a backup made through the Backup tab, the data lost, then upload (4 MiB chunks), validate, plan, merge "Now", the job succeeds and verifies, the stored parts are identical, and a learner's hub on a new browser shows the restored progress. Run on Postgres by `make e2e-pg` and CI ([build-contracts.md §26](docs/build-contracts.md)) |

The M1-M3 specs sign in with fake ID tokens and drive the test-only routes, so the server must run with `APP_ENV=test AUTH_MODE=fake STORE=memory ADMIN_EMAILS=admin@studyhubs.test` (`dev-e2e.sh` starts it that way, with a fixed test `SECRET_KEY`, `ADMIN_TZ=Asia/Kolkata` and a `DATA_DIR` of its own). `E2E_STORE=postgres` with `DATABASE_URL` runs it on Postgres instead, keeping the Firestore quota tiers the M1 specs expect (`dev-e2e-pg.sh` sets both; the whole suite passes there too). They reset the shared memory store before each test and set faults, quota and clock offsets, so they run in their own Playwright project, `sync`, one test at a time; the M0 specs (`chromium` project) stay fully parallel next to them. Against a deployed site only the `@smoke` M0 subset makes sense.

The bridge's modal and menu sit in **closed** shadow roots. Tests reach them through the Chrome DevTools Protocol (accessibility tree and real mouse clicks; see `e2e/tests/support/shadow.ts`). Google Fonts is stubbed with an empty stylesheet, so runs are offline-safe and deterministic.

```bash
sh site/scripts/dev-e2e.sh                       # whole suite, M0-M3 on memory (~5 min; the sync project is serial)
sh site/scripts/dev-e2e.sh --project=chromium    # M0 only (~30 s, 4 workers)
sh site/scripts/dev-e2e.sh --project=sync        # M1-M3 only
sh site/scripts/dev-e2e.sh --grep @smoke         # HTTP contract only
sh site/scripts/dev-e2e.sh tests/ai.spec.ts      # one file
sh site/scripts/dev-e2e-pg.sh                    # m3-restore.spec.ts on Postgres (starts dev_pg.sh if needed)
sh site/scripts/dev-e2e-pg.sh --project=sync     # every serial spec on Postgres
E2E_STORE=firestore FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 sh site/scripts/dev-e2e.sh --project=sync   # on the emulator (make emulator)
cd site/e2e && BASE_URL=https://study-hubs.onrender.com npx playwright test --project=chromium --grep @smoke   # a deployed site
```

| Variable | Default | Meaning |
|---|---|---|
| `BASE_URL` | `http://127.0.0.1:10000` | Server under test |
| `E2E_EXPECT_HSTS` | `1` for https, else `0` | Whether `Strict-Transport-Security` must be present (production only) |
| `E2E_EXPECT_SLUGS` | the 7 original slugs | Comma list that must be in the catalog; empty disables the check |
| `E2E_WORKERS` | 4 (2 in CI) | Parallel browsers |
| `E2E_STORE` | unset (any) | `memory`, `postgres` or `firestore`: the store the server must run (`m3-restore.spec.ts` checks it); `dev-e2e.sh` sets it (`firestore` needs `FIRESTORE_EMULATOR_HOST` and uses the emulator project `demo-e2e`) |

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

**M1 (accounts and sync, [build-contracts.md §8](docs/build-contracts.md)).** Every variable has a safe default outside production. In production the server **refuses to start** without `SECRET_KEY` (≥ 32 bytes), `FIREBASE_PROJECT_ID` and `FIREBASE_WEB_CONFIG`, and refuses `AUTH_MODE=fake`, `STORE=memory` and `FIRESTORE_EMULATOR_HOST`.

| Variable | Default | Notes |
|---|---|---|
| `AUTH_MODE` | `firebase` in production, `fake` otherwise | `fake` (sign in with `"fake:" + base64url(JSON {uid, email, emailVerified?, provider?})`) is refused in production, and on a real Firestore (`STORE=firestore` without `FIRESTORE_EMULATOR_HOST`) in any environment |
| `STORE` | `firestore` in production, `memory` otherwise | `memory` is refused in production; `postgres` (M3) needs `DATABASE_URL` |
| `SECRET_KEY` | dev/test: a fixed constant plus a warning | Production: required, ≥ 32 bytes (Render generates it). Signs `publicId` and fake sessions; changing it changes every `publicId` |
| `SESSION_DAYS` | `14` | Session cookie lifetime (`__Host-sh_session` on https, `sh_session` on http) |
| `FIREBASE_PROJECT_ID` | – | Required when `AUTH_MODE=firebase` or `STORE=firestore` |
| `FIREBASE_WEB_CONFIG` | – | One-line JSON `{"apiKey","authDomain","projectId","appId"}`, served by `/api/config` |
| `GOOGLE_APPLICATION_CREDENTIALS` / `FIREBASE_SERVICE_ACCOUNT_B64` | – | Service-account key: a file path (Render Secret File `/etc/secrets/firebase-sa.json`) or base64 JSON |
| `FIRESTORE_EMULATOR_HOST` | – | Tests and CI only (`127.0.0.1:8080`) |
| `TRUSTED_PROXY_HOPS` | `1` in production, `0` otherwise | Which `X-Forwarded-For` entry is the client IP for rate limits (Render appends one) |
| `SYNC_TIERS` | `0.5:120:0:60,0.8:300:60:120,1.0:900:60:300` | `frac:flushS:hiddenMinS:refreshS`; at `f ≥ 1.0` sync pauses until the Pacific-midnight reset |
| `QUOTA_ENFORCE` | `1` | `0` disables tiers and the budget |
| `QUOTA_TZ`, `QUOTA_READS`, `QUOTA_WRITES`, `QUOTA_DELETES`, `QUOTA_RESERVE` | `America/Los_Angeles`, `50000`, `20000`, `20000`, `0.05` | Spark's daily free tier. Budget `B = QUOTA_WRITES × (1 − QUOTA_RESERVE)`, `f = writesToday / B` |
| `MAX_PART_GZ`, `MAX_DOC_GZ`, `MAX_BODY`, `MAX_BODY_DECOMPRESSED` | `131072`, `393216`, `2097152`, `8388608` | Size limits in bytes |
| `CLOCK_SKEW_MS` | `900000` | A part stamped further in the future is refused (`422 clock_skew`) |
| `USER_WRITES_PER_DAY` | `300` | Accepted hub-doc writes per user per Pacific day, then `429 sync_paused` |
| `MAINTENANCE_FORCE` | unset | `read_only` or `full` |

**M2 (admin, maintenance, backups, [build-contracts.md §17](docs/build-contracts.md)):**

| Variable | Default | Notes |
|---|---|---|
| `ADMIN_EMAILS` | empty (no admins) | Comma-separated, case-insensitive. An admin is a **Google** sign-in with a verified email in this list |
| `ADMIN_TZ` | `Asia/Kolkata` | Default time zone of the admin pages and of "Tonight 00:00" (Settings can change the site's zone) |
| `DATA_DIR` | `/tmp/studyhubs` | Scratch (backups stream straight to the browser) and restore staging (M3). **Not persistent on Render free**: see [M3](#m3-restore) |
| `JOB_GRACE_MIN` | `60` | A scheduled window this many minutes late is `missed` and does not run |
| `MAX_BACKUP_BYTES` | `2147483648` | |

**M3 (Postgres store, restore, [build-contracts.md §23-24](docs/build-contracts.md)):**

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | – | `postgresql://user:pass@host:5432/db`, required with `STORE=postgres`. The schema (`app/store/sql/0001_init.sql`) is applied on first use under an advisory lock and tracked in `schema_migrations` |
| `PG_POOL_MAX` | `5` | Connection pool size |
| `QUOTA_ENFORCE`, `SYNC_TIERS` with `STORE=postgres` | `0`, `1:30:0:30` | No Firestore quota behind Postgres: one tier with a 30 s flush. Explicit values win |
| `MAX_BACKUP_BYTES` | `2147483648` | Also the largest upload the restore accepts; staging needs twice the file size free in `DATA_DIR` |

AWS compose with Postgres and its runbook are M4 ([architecture-spec.md §4.12](docs/architecture-spec.md)).

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
| Environment | `APP_ENV=production`, `PUBLIC_ORIGIN=https://<your-service>.onrender.com`, `LOG_LEVEL=INFO`, plus the M1 variables below |

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
| `e2e` | Builds everything as `make build` does, runs the whole Playwright suite (M0-M3) against uvicorn via `dev-e2e.sh`, then `m3-restore.spec.ts` against uvicorn on a `postgres:16` service, builds the Docker image, runs `check-image.sh`, then smoke-tests the container in production mode (with a demo Firebase config: `/api/config` says `firebase`, `/api/test/*` is absent, `@smoke` passes) |
| `contract` | Starts the Firestore emulator (Temurin 21, `firebase-tools@15.31.0`) and a `postgres:16` service, and runs the store contract suite (S17 and S18 included) on memory, the emulator and Postgres with `REQUIRE_PG=1` |
| `deploy` | Main only, needs all three jobs, skipped without the secret. It first checks that the commit is still the head of `main`; if not, the newer commit's run deploys. Then it calls the deploy hook and polls `PUBLIC_ORIGIN/api/version` until `commit` equals the tested SHA (10 min timeout), and finally checks `/healthz` and `/catalog.json` |

Commits that only touch notes match none of the workflow's paths, so they test and deploy nothing. Run **Actions → site → Run workflow** to redeploy by hand.

### 3. M1: accounts and sync

<a id="m1-accounts-and-sync"></a>
Accounts use **Firebase Authentication** on the free **Spark** plan and progress lives in **Firestore**. Browsers never talk to Firestore: the server does, with a service account, and the Security Rules deny every client request. Do these steps once, in this order.

**Firebase project**
1. https://console.firebase.google.com → **Add project** (for example `study-hubs`). Google Analytics is not needed. Note the **project id** (`study-hubs-xxxxx`). Stay on **Spark** (no billing account).
2. **Authentication → Get started → Sign-in method:** enable **Google** (set the public-facing name "Study Hubs" and a support email) and **Email/Password** (leave "Email link" off).
3. **Do not upgrade to Identity Platform** when the console offers it. The upgrade cannot be undone and moves auth to a different (billed) quota.
4. **Authentication → Settings → Authorized domains:** add the Render host (`study-hubs-xxxx.onrender.com`, exactly as in `PUBLIC_ORIGIN`) and any custom domain. Keep `localhost` and `<project>.firebaseapp.com`.
5. **Firestore Database → Create database:** **Standard** edition, database ID **`(default)`**, location **`asia-southeast1` (Singapore)**, next to the Render service. Start in **production mode**. The location cannot be changed later.
6. Deploy the rules (deny all) and the index exemptions from this repo:
   ```bash
   cd site/firebase
   npx firebase-tools@15.31.0 login
   npx firebase-tools@15.31.0 deploy --only firestore:rules,firestore:indexes --project <project-id>
   ```
   (Or copy `.firebaserc.example` to `.firebaserc`, which git ignores, and drop `--project`.) Check **Firestore → Rules** shows `allow read, write: if false` and **Indexes → Single field** lists the exemptions.

**Service account (server credentials)**
7. https://console.cloud.google.com → pick the project → **IAM & Admin → Service Accounts → Create service account** named `study-hubs-server`. Grant exactly **Cloud Datastore User** (`roles/datastore.user`) and **Firebase Authentication Admin** (`roles/firebaseauth.admin`). Do not use the default `firebase-adminsdk` account (it has far wider roles).
8. On the new account: **Keys → Add key → Create new key → JSON**. In Render: **study-hubs → Environment → Secret Files → Add**, filename **`firebase-sa.json`**, paste the file's contents, save. Render mounts it at `/etc/secrets/firebase-sa.json`, which `GOOGLE_APPLICATION_CREDENTIALS` points to.
9. **Delete the downloaded key file** from your computer (and from Downloads/trash). Never commit it or paste it into notes; a lost key is revoked in the same Keys tab.

**Web app and API key**
10. Firebase console → **Project settings → General → Your apps → Add app → Web** (no Hosting). From the shown `firebaseConfig`, build one line of JSON with only four fields and set it as **`FIREBASE_WEB_CONFIG`** in Render:
    `{"apiKey":"AIza…","authDomain":"<project-id>.firebaseapp.com","projectId":"<project-id>","appId":"1:…:web:…"}`
11. Google Cloud console → **APIs & Services → Credentials** → the **Browser key (auto created by Firebase)** → **Application restrictions: Websites (HTTP referrers)**: `https://<render-host>/*`, `https://<project-id>.firebaseapp.com/*` and any custom domain. Under **API restrictions** allow only **Identity Toolkit API** and **Token Service API**. Save. (The key is public by design; the restriction stops other sites from using your auth quota.)
12. **OAuth consent screen** (Google Auth Platform → Branding): app name **Study Hubs**, a support email, home page `https://<render-host>/`, privacy policy **`https://<render-host>/privacy`**, and the site's domain under Authorized domains. Leave it **In production** with only the default scopes (email, profile, openid), so no verification is needed.

**Render environment** (the Blueprint creates the keys; fill the `sync: false` ones):

| Variable | Value |
|---|---|
| `STORE` / `AUTH_MODE` | `firestore` / `firebase` |
| `SECRET_KEY` | generated by Render (keep it: changing it changes every `publicId`) |
| `FIREBASE_PROJECT_ID` | `<project-id>` |
| `FIREBASE_WEB_CONFIG` | the JSON line from step 10 |
| `GOOGLE_APPLICATION_CREDENTIALS` | `/etc/secrets/firebase-sa.json` (Secret File from step 8) |
| `TRUSTED_PROXY_HOPS` | `1` |

Then deploy (Manual Deploy, or push to `main` and let CI do it).

**Verify after deploy**
1. `curl -s https://<host>/api/config` shows `"authMode":"firebase"` and your `projectId`; `curl -s https://<host>/api/me` shows `{"signedIn":false}`.
2. `curl -s -o /dev/null -w '%{http_code}\n' -H 'X-StudyHubs: 1' https://<host>/api/test/store` prints `404` (test routes are never mounted in production).
3. Render logs show `auth=firebase store=firestore` at startup and no `Firestore unavailable` or credentials warnings.
4. Open `/signin` → **Continue with Google** → you land back signed in; the header shows your initial and `/account` shows your email.
5. Open a hub, answer a question, then switch tabs (a hidden tab flushes at once). The pill says **Synced to your account**, and Firestore → Data shows `users/<uid>` and `progress/<uid>~<hubId>`.
6. In another browser (or a private window), sign in with the same account and open the same hub: the progress is there.
7. Sign up with email/password: the verification email arrives, the link opens `/verify`, and **I've verified** signs you in. Password reset mails arrive from `/reset`.
8. `/signout` → the hub's progress is gone from this browser; sign in again → it comes back.
9. Firestore → Usage stays tiny (about one write per hub per flush), and `usage/<YYYY-MM-DD>` counts reads and writes. Firestore → Rules → **Rules Playground**: an unauthenticated `get` on `/progress/x` is denied.

### 4. M2: admin, backups and maintenance

<a id="m2-admin"></a>
**Make yourself an admin**
1. Render → **study-hubs → Environment**: set **`ADMIN_EMAILS`** to your Google address (several: comma-separated), and `ADMIN_TZ` if you are not on IST. Save; Render redeploys.
2. Sign in with **Continue with Google** using that address. Only a Google sign-in with a verified email counts: the same address signed in with a password is not an admin. The header menu now has **Admin**; for everyone else `/admin` and every `/api/admin/*` route answer 404, as if they did not exist.
3. Destructive actions (taking a backup, entering **Full** maintenance, cancelling a window, deleting an account) need a sign-in within the last 24 hours. If yours is older, the page sends you to **Sign in again** and back.
4. Check: `curl -s -o /dev/null -w '%{http_code}\n' https://<host>/api/admin/stats` prints `404` (anonymous), and **Admin → Overview** shows today's Firestore meters, the next quota reset in IST and Pacific time, the user count and the last backup.

**Take a backup**
1. **Admin → Backup.** The estimate shows the reads a backup needs (about one per user, progress document and deleted-account marker). It must fit in today's remaining reads with 20% kept in reserve; if not, wait for the quota reset shown on **Overview** (midnight Pacific).
2. Optional: tick **Encrypt with a passphrase**. A random passphrase is filled in (you can type your own, 12+ characters). Put it in your password manager **now**: it is shown once, never stored, and without it the file can't be restored.
3. Keep **Use read-only maintenance during backup** ticked: sync pauses for the few seconds of the run (hubs keep saving in the browser and catch up afterwards), so the file is a consistent snapshot. The previous mode comes back on its own.
4. Type **BACKUP** and press **Create backup and download**. The browser saves `studyhubs-YYYYMMDD-HHMMSSZ.backup` through a single-use link (valid 120 s); keep the tab open until it finishes. **Refresh log** then shows its size and SHA-256.
5. Verify the file offline, then store it off your laptop:
   ```bash
   site/server/.venv/bin/python site/scripts/backup_tool.py verify ~/Downloads/studyhubs-20261013-183000Z.backup
   # encrypted: add --passphrase-file pass.txt (or set BACKUP_PASSPHRASE)
   ```
   It prints the record counts and `fileSha256`, which must match the log. To restore it, see [M3: restore from a backup](#m3-restore).

**Schedule a maintenance window at midnight**
1. **Admin → Maintenance & schedule → Schedule a window:** mode **Read-only** (sync pauses, everything else works) or **Full** (every account API answers 503; type **FULL**), start **Tonight 00:00** (midnight in the site time zone shown next to it: **Settings**, default `ADMIN_TZ`) or a date and time, a duration in minutes and an optional message for learners. Press **Schedule window**.
2. From 10 minutes before the start, signed-in pages get the upcoming window with `/api/me`. At the start the server switches the mode, and at start + duration it restores the mode that was set before. The jobs list shows `scheduled → running → succeeded`.
3. The scheduler runs inside the web service (a tick every 20 s), so the service must be awake: keep the UptimeRobot monitor (step 6). A window that starts more than `JOB_GRACE_MIN` (60) minutes late becomes `missed`, does not run, and **Overview** shows a banner.
4. **Cancel** in the jobs list (type **CANCEL**) removes a scheduled window, or ends a running one at once. The **Maintenance mode** form at the top sets the mode by hand (Off, Read-only, Full); `MAINTENANCE_FORCE` in the environment overrides both.

**Account deletion and export (learners)**
- **Account → Download my data** gives the learner everything stored for them as `studyhubs-export-YYYYMMDD.json` (5 per hour).
- **Account → Delete my account** (type **DELETE**; a sign-in within 24 h; 3 per hour) deletes the progress documents and the user document, records a tombstone (a SHA-256 of the uid, so an M3 restore never brings the account back), deletes the Firebase Auth user and clears the cookies. The browser then wipes its hub progress and tells open hub tabs, and the learner lands on the catalog signed out. Each step is safe to repeat, so a failure part-way can simply be retried.
- There is no admin tool to delete someone else's account in M2: point learners to their account page (`/privacy` explains both).

### 5. M3: restore from a backup

<a id="m3-restore"></a>
**Render free: upload, validate and restore in one sitting.** The upload is staged in `DATA_DIR` (default `/tmp/studyhubs`), and Render's free instances lose that disk on every deploy, restart or sleep. So do all of it in one go: keep the UptimeRobot monitor running, don't push to `main` meanwhile, and choose **Now**, not **Tonight**. If the instance restarts in between, the wizard has nothing left to resume: upload the file again. A job that loses its staged file fails with "the validated upload is gone"; if it had already applied some records it becomes `needs_attention` and the site stays in **Full** maintenance. Upload and validate the same file again and run it again: a merge is idempotent. On AWS (M4) `DATA_DIR` is the `/data` volume, so a restore can wait for the night there.

**Before you start**
- Take a fresh backup of the site as it is now (**Admin → Backup**), in case the restore is not what you wanted. This matters most for **Replace**.
- Destructive rules apply: a Google sign-in within the last 24 hours (the page sends you to **Sign in again** otherwise).
- During the job the site is in **Full** maintenance: hubs keep working and saving in the browser, the account API answers 503, and everything syncs afterwards. Admins can still sign in.

**Steps (Admin → Restore)**
1. **Pick a file.** Choose the `.backup`. The browser reads its first 64 KiB and shows the header: source store and origin, when it was made, whether it is encrypted, and the estimated users and progress documents. Nothing has been sent yet.
2. **Upload.** Press **Upload <file>**. It goes up in 4 MiB chunks, each with its SHA-256, so a damaged chunk is resent. **Pause** stops it. After a reload (or a closed tab), open **Restore** and pick the **same** file (same name, size and modified time): only the missing chunks are sent. One upload at a time; **Discard upload** deletes it from the server.
3. **Validate.** For an encrypted backup, type its passphrase. It is sent once, used, and dropped by the server; it is never stored. The server checks every frame, line, count and the final SHA-256, and writes nothing to the site. A wrong passphrase, a tampered or a truncated file shows "The backup is not valid"; you can try another passphrase. A valid file shows the plan:
   - users new and already here
   - progress parts newer in the backup (written), older (this site's newer copy is kept) and identical
   - deleted accounts skipped (deleted in the backup or on this site: a restore never brings one back)
   - on Firestore: the estimated writes, how many days of quota they need and whether they fit today
4. **Choose.**
   - Mode: **Merge** (the default; newest wins per part, nothing is deleted; every store) or **Replace** (Postgres only: the site's users and progress become exactly the backup's). Render runs Firestore, so use Merge there.
   - When: **Now**, **Tonight 00:00** (in `ADMIN_TZ`), or **After the next Firestore quota reset** (Firestore only: Pacific midnight + 5 min).
   - Keep **Leave maintenance when the restore succeeds** ticked to get the previous mode back afterwards.
5. **Confirm.** Type the phrase the page shows: `RESTORE` for a merge, `REPLACE <n> USERS` for a replace (n = the users on the site now). Press **Start restore**.
6. **Watch the job.** The page shows the state, the records applied out of the total and, at the end, the report. **Cancel restore** (type `CANCEL`) works only while it is still `scheduled`, and deletes the staged upload too (upload it again to restore later).
   - It first spends about a minute in **Full** maintenance without writing (`drainUntil` on the job): every instance re-reads the mode within 60 s and requests already under way finish, so a sync or an account deletion that slipped in just before is never overwritten or brought back. A resumed job waits the same way whenever it has to switch **Full** back on itself.
   - The job runs only the exact file it was confirmed with: if the staged upload changed or is being validated again, it fails before writing anything (validate and start a new restore).
   - Firestore: writes start at 50/s and speed up every 5 minutes. When the day's write budget runs out the job pauses (`paused_quota`) and resumes after the reset, so a large restore can take several days (the plan said how many).
   - A job left `running` by an instance that died is picked up again 2 minutes after its last heartbeat and continues from its checkpoint; no batch is applied twice.
   - A **Full** maintenance window that ends while a restore that started inside it is still running, paused or failed does not lift the maintenance: the restore takes over the window's previous mode and puts it back when it succeeds.
   - **Success:** the counts are checked against the backup's, a 1% sample (at most 200 parts) is read back and compared, the staged file is deleted and the previous mode comes back.
   - **Failure:** the job becomes `needs_attention`, the site stays in **Full** maintenance, and **Overview** shows a banner with the error. Fix the cause, then run the restore again, or set the mode by hand in **Maintenance & schedule**.
7. **Check.** Sign in as a learner in a private window and open a hub: it shows the restored progress. **Overview** shows the user count.

### 6. Keep it awake (UptimeRobot)

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
