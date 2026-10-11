---
title: "Study Hubs website: implementation plan"
created: 2026-10-11
status: draft — awaiting Sushant's approval
---
# Study Hubs website: implementation plan

The goal is to publish the vault's Study Hubs as a public website. Anyone can study. Progress is kept in the browser until the person signs in (Google or email), and from then on it syncs to their account. **The hub files are never edited.** New hubs appear automatically on the next deploy.

The detailed engineering spec is [architecture-spec.md](architecture-spec.md). Evidence behind it:
- [hub-runtime-contract.md](hub-runtime-contract.md): what every hub expects, line by line.
- [bridge-prototype-findings.md](bridge-prototype-findings.md): 10 of 10 scenarios passed on real hubs in headless Chromium.
- [prototype/](prototype/): the working prototype bridge and mock server.

This plan is the agreed scope. Where it trims the spec, it says so.

## 1. Decisions (agreed 2026-10-11)

| Topic | Decision |
|---|---|
| Content | Hubs only: the 7 today, plus any new `*-hub.html` or `*Study Hub.html` found by the collector |
| Anonymous visitors | Can study everything. Progress lives in `localStorage`, as it already does in the hubs |
| Accounts | Firebase Auth: Google sign-in plus email/password. Email accounts must verify before they sync. No email-link sign-in, no Identity Platform upgrade |
| Database now | Firestore, Standard edition, `(default)` database, free Spark plan |
| Database later | Postgres on an AWS Linux server, run with docker compose. Move: new deploy → upload `.backup` in its admin page → restore at midnight → point DNS |
| Overflow | No automatic spillover. Admin `.backup` download/upload, meters, and migration triggers |
| AI | None on the site. AI buttons stay visible; clicking one opens a notice with **Download this hub**, which serves the original file |
| Hosting | Render free (Docker, Singapore), kept awake by a free UptimeRobot ping of `/healthz` every 5 minutes |
| Name and address | "Study Hubs" at `study-hubs.onrender.com` (placeholder) |
| Code | `site/` in this repo. FastAPI backend; React (Vite) client built into the backend's `public/` |
| First sign-in / logout | Browser progress merges into the account (newest wins). Logout clears hub progress from that browser, after flushing |

## 2. How it works

```
 Browser                                   Render (1 container)                         Google
 ───────                                   ────────────────────                         ──────
 /            React shell (catalog,   ──>  FastAPI  ── serves public/ (React build)
 /signin …    sign-in, account, admin)         │      /h/<slug>  hub file + 1 injected <script src="/_sh/bridge.js">
                                               │      /h/<slug>/download  original bytes
 /h/<slug>    the hub itself, top-level        │      /api/*  session cookie auth ─────────> Firebase Auth (verify)
   └ bridge.js emulates window.claude ─────────┘      store adapter ──────────── gRPC ─────> Firestore (Spark)
     db/user  → /api/progress, /api/sync                         └─(AWS later)── SQL ──────> Postgres
     sample   → "AI isn't supported here" notice
```

**The bridge is the key piece.** The 6 modern hubs already look for `window.claude.use("db" | "user" | "sample")` and fall back to "Saved in this browser" when it isn't there. The server injects one synchronous `<script>` before `</head>`; nothing else in the file changes, and a CI test checks that byte for byte. The bridge:
- **Signed out:** returns no database, so the hub stays in browser mode. It makes zero API calls.
- **Signed in:** maps the hub's 3 records (`main`, `mocks`, `cards`) onto one server document per (user, hub). It batches saves (120 s while the daily write budget is under 50%, slower near the limit) and always flushes when the tab is hidden or closed. On close it sends a keepalive request built from the hub's `localStorage`, gzipped when large, so even the last answer reaches the server.
- **Errors:** quota, maintenance and outages show as "Sync paused, saved in this browser" and retry automatically. Progress is never lost, because the browser copy is always kept.
- **AI:** keeps AI buttons visible. Each click opens a notice: *"AI isn't supported here. Download this hub and use it in your own AI provider for Ask-AI features (for example, upload it to Claude and open it as an artifact). Your progress on this site isn't included in the file."*
- **AI-901 (legacy hub):** a small per-user seed script runs before the hub reads its storage, and the bridge copies its saves to the server.
- **Wrong account:** an owner tag stops one account's browser data from being pushed into another account.

**Server rule: newest wins.** Every write runs in a transaction. A part is stored only when its timestamp is newer than the stored one, and timestamps more than 15 minutes in the future are refused. No acknowledgement is sent before the commit.

## 3. Firestore free-tier budget

The tightest limit is **20,000 writes a day**, which resets at midnight Pacific (12:30 IST, or 13:30 IST from 1 Nov).
- One save of a hub costs 1 read plus at most 1 write, however many parts changed.
- With batching, a 40-minute session costs about 24 writes. That is roughly **1,500 signed-in study sessions a day** for free.
- The server sends a slower save rhythm as the budget fills: tier 2 at 50%, tier 3 at 80%. At 95% it pauses sync until the reset, and browsers keep the progress.
- Data is stored as gzipped bytes in index-exempt fields: about 4× smaller, and it doesn't inflate the 1 GiB storage cap.

The admin page shows writes, reads, estimated storage and egress against the free limits. It suggests the AWS move when a limit stays high for a week.

## 4. Admin, backup and restore

- **Admin access:** your Google account, from the `ADMIN_EMAILS` allow-list. Signing in with Google is required, and destructive actions need a sign-in within the last 24 hours plus a typed confirmation.
- **`.backup` file:**
  - Format: a small header, then gzipped NDJSON holding users, progress, settings and account-deletion tombstones, then an end record with counts and a SHA-256.
  - Optional passphrase: AES-256-GCM in 1 MiB frames, with the key derived by scrypt. The passphrase is never stored.
  - The file is streamed straight from the database, so memory use stays flat on Render's 512 MB.
  - Before starting, the admin page shows how many of today's reads it will use.
- **Restore:**
  1. Upload in 4 MiB chunks; an interrupted upload resumes.
  2. Validate everything before any write: decrypt, checksum, counts, schema, and a plan of what will change.
  3. Run now or schedule (default **00:00 IST**). During the run the site is in maintenance and browsers keep progress locally.
  4. Writes are batched together with a checkpoint, so a crash resumes exactly where it stopped.
  5. Check counts plus spot checks, then leave maintenance.

  Modes: `merge` (newest wins) or `replace` (Postgres).
- **Maintenance modes:** `off`, `read_only` (no syncing) and `full`. These can be scheduled with a 10-minute warning banner.
- **AWS runbook:** included with timings: rehearse first, then cut over at midnight. Render keeps a "moved" notice for a week.

## 5. Pages

| Route | What it shows |
|---|---|
| `/` | Catalog grouped by subject, with L1–L4 and Cert chips, search, each hub's local progress, and Open / Download buttons |
| `/h/<slug>` | The hub itself, plus a small floating menu: ← All hubs, Sign in / account, Download, and status notices |
| `/signin`, `/signup`, `/reset`, `/verify`, `/signout` | Firebase popup or password flows |
| `/account` | Per-hub progress on your account, browser storage use, export my data, delete account |
| `/admin` | Overview meters, Backup, Restore wizard, Maintenance & schedule, Settings (timezone, notice) |
| `/privacy` | What is stored and why. Needed for the Google sign-in consent screen |

Styling reuses the hubs' own design tokens and fonts, so the shell and the hubs look like one site, in light and dark modes.

## 6. Security

- **Hub pages:** strict per-hub CSP using SHA-256 hashes of each inline script, already checked on all 7 hubs with zero violations. `frame-ancestors 'none'`.
- **Sessions:** an `HttpOnly`, `Secure`, `SameSite=Lax` session cookie (14 days) made from the Firebase ID token. API writes also require a custom header plus an exact Origin check (CSRF).
- **Firestore:** rules deny all browser access; only the server touches data.
- **Rate limits:** on sign-in, sync, export and delete, plus a per-user daily write cap.
- **Build:** copies only hub HTML files. `.dockerignore` is an allow-list, and checks run on the build context and on the final image. `_meta/`, `sessions/`, `practice/`, `work/` and courses can never reach the server. A publish lint flags emails and API-key patterns in hubs.

## 7. Repo layout (summary)

```
.dockerignore                   allow-list: site/** and the two hub globs only
.github/workflows/site.yml      test → e2e → Render deploy hook (path-filtered; notes-only commits deploy nothing)
site/
  README.md  Dockerfile  render.yaml  hubs.config.json
  bridge/      TypeScript → one small IIFE (≤ 14 KB gz) + vendored fflate
  client/      React + Vite + TS (catalog, auth pages, account, admin)
  server/app/  FastAPI: auth/, progress/, store/{firestore,postgres,memory}, quota/, backup/, jobs/, admin/
  scripts/     collect-hubs.mjs (discover → inject → CSP hashes → br/gz → catalog), image/context checks, dev Postgres
  e2e/         Playwright: the prototype's 10 scenarios + CSP, cost, account-switch, maintenance, restore tests
  firebase/    firestore.rules (deny all), index exemptions
  deploy/aws/  compose.yaml (app + postgres + caddy TLS), backup cron, RUNBOOK.md
  docs/        this plan, the spec, contract, prototype evidence
```

## 8. Milestones (each ends with a commit, and acceptance tests green)

| # | Scope | Done when |
|---|---|---|
| **M0 Static site** | Collector, hub serving and download, bridge in anonymous mode (AI notice, floating menu), catalog page, Dockerfile, CI | All 7 hubs work at `/h/<slug>` with browser progress; zero API calls when signed out; AI notice on every AI path; CSP clean; served file minus the injection equals the original; image contains no private folders |
| **M1 Accounts + Firestore sync** | Firebase sessions, `/api/progress` + `/api/sync`, newest-wins store, quota meter and tiers, full bridge sync, sign-in/up/reset/verify, merge on first login, logout, AI-901 sync | Prototype scenarios S3–S10 pass in e2e against the real server; cross-device sync works; ≤ 1 write per hub per save; quota trip shows "Sync paused" and recovers |
| **M2 Admin + account** | Stats and meters, maintenance plus scheduling, streaming backup (optional passphrase), account page (export, delete), privacy page | Backup of 20k synthetic docs stays under 300 MB RAM; delete leaves no data; a scheduled window fires on time and survives a restart |
| **M3 Postgres + restore** | Postgres adapter, the same contract tests on memory, Postgres and the Firestore emulator, chunked upload, validate, restore jobs with checkpoints and `replace` | Firestore backup restores into Postgres with a clean report; kill -9 mid-restore resumes to an identical state; tampered or wrong-passphrase files fail before any write |
| **M4 AWS readiness** | compose + Caddy + backup cron, runbook rehearsal, hardening, README | Full rehearsal on local compose recorded; rollback tested |

The spec estimates 1–2 working sessions per milestone. I'll build them in order, with tests, and stop at each milestone for a check.

## 9. Trimmed from the spec for v1 (backlog)

- **Re-auth:** a fresh ID token per destructive admin call (`X-Reauth`) is replaced by "signed in within 24 h + typed confirmation".
- **Render egress:** "saver mode" tiers are replaced by a meter and banner only.
- Per-IP rate limits on hub page loads.
- Conflict copies.
- Auto-eviction of local copies when browser storage is full. A banner is shown instead.
- Firebase App Check.
- Analytics.
- WebKit e2e beyond one mobile smoke test.

## 10. What you'll need to do (I'll give click-by-click steps when we get there)

1. **Firebase (M1):**
   - Create a Spark project and enable Google + Email/Password. Don't click "Upgrade to Identity Platform".
   - Create a Firestore **Standard** database `(default)` in **asia-southeast1**. The location can't be changed later.
   - Add `study-hubs.onrender.com` to Authorized domains.
   - Create a service-account key; it goes into Render as a secret file.
2. **Render (M0):** connect the GitHub repo, create a free Docker web service in Singapore and paste the environment variables I list.
3. **UptimeRobot (M0):** create a free HTTP monitor on `/healthz` every 5 minutes.
4. **GitHub (optional, M0):** add the Render deploy-hook URL as a repository secret so CI deploys after tests pass.

## 11. Known risks

- **Browser progress and the domain:** it is tied to the domain. Moving from `*.onrender.com` to a custom domain later leaves signed-out visitors' progress behind; signed-in users are unaffected. The spec has an optional hand-over page.
- **Render's free bandwidth:** reported as 5 GB/month since the 2026 plan change, which is about 30k uncached hub loads. Hubs are served brotli-compressed with caching. Cloudflare in front of a custom domain is the fix if it's ever reached.
- **Firestore at the 1 GiB cap:** the behaviour isn't documented, so the site refuses *new* progress documents at 90% of the estimate and shows a banner.
- **Unverified Render details:** a few (Blueprint path under `site/`, deploy hook, Secret Files) are confirmed during M0. Each has a manual fallback.
