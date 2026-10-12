# Study Hubs server

FastAPI backend for the Study Hubs site. It serves the hub files from the collector
output, the React shell from `public/`, and the JSON API: accounts (Firebase Auth
session cookies) and progress sync (Firestore). Interfaces are fixed in
[`../docs/build-contracts.md`](../docs/build-contracts.md): section 5 for routes and
headers, sections 8–12 and 15 for M1.

## Develop

```bash
cd site/server
python3.12 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt     # hash-checked
.venv/bin/ruff check . && .venv/bin/ruff format --check .
.venv/bin/pytest                                  # unit + api + M0; contract on memory
.venv/bin/uvicorn app.main:app --port 10000 --reload
```

Build the bridge, the client and the collector output first (see the contract,
section 2) or the server starts anyway and answers `/h/*` with a 503 page.

Outside production the defaults are `AUTH_MODE=fake` and `STORE=memory`: sign in with
a fake token (`"fake:" + base64url(JSON {uid, email, emailVerified?, provider?, name?})`,
see `app/auth/fake.py`) and progress lives in the process.

### Contract tests on the Firestore emulator

`tests/contract/` runs one suite on every store. The Firestore half is skipped unless
`FIRESTORE_EMULATOR_HOST` is set. It needs Java 21:

```bash
cd site/firebase && npx --yes firebase-tools@15.31.0 emulators:start --only firestore --project demo-studyhubs &
# or: java -jar ~/.cache/firebase/emulators/cloud-firestore-emulator-v*.jar --host 127.0.0.1 --port 8080 &
cd site/server && FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 .venv/bin/pytest tests/contract
```

The suite wipes the `demo-studyhubs-contract` project in the emulator first. Besides
the adapter's own read/write counter it counts the documents each gRPC call bills
(`CountingApi`), so the cost claims (GET unchanged 1 read, changed 2, a 3-part sync
1 read + 1 write) are checked on the wire.

## Layout

| Path | What |
|---|---|
| `app/main.py` | `create_app(settings, *, store=, auth=, clock=)` factory, middleware, lifespan, the module-level `app` |
| `app/config.py` | `Settings.from_env()`; production refuses fake auth, the memory store, a missing or short `SECRET_KEY` and missing Firebase settings |
| `app/runtime.py` | the M1 services one process shares (clock, store, auth, meter, guard, rate limits, test faults) |
| `app/catalog.py` | loads and validates `catalog.internal.json` |
| `app/precompressed.py` | br/gzip negotiation, sha256 ETags, 304s, scanned allow-lists |
| `app/hubs_routes.py` | `/h/{slug}`, `/h/{slug}/download`, `/catalog.json` |
| `app/static_routes.py` | `/_sh/*`, `/assets/*`, `/robots.txt`, SPA routes (never framed) and the catch-all |
| `app/api_routes.py` | `/healthz`, `/api/version` |
| `app/auth/` | `routes.py` (`/api/config`, `/api/me`, `/api/auth/session`, `/api/auth/logout`), `firebase.py`, `fake.py`, `session.py` (cookies, publicId), `deps.py` (who is asking), `csrf.py`, `ratelimit.py` |
| `app/progress/` | `routes.py` (`/api/progress/{hubId}`, `/api/sync`), `seed.py` (`/api/seed/{id}.js`), `validate.py`, `decide.py` (newest wins), `service.py` |
| `app/store/` | `base.py` (protocol, errors, records), `memory.py`, `firestore.py`, `factory.py` |
| `app/quota/` | `pacific.py` (quota days), `meter.py`, `guard.py` (tiers, budget, breaker, per-user cap), `policy.py`, `egress.py` |
| `app/testing/routes.py` | `/api/test/*`, mounted only when `APP_ENV=test` |
| `app/security.py`, `app/api_gzip.py` | global headers; gzip for `/api` only |
| `app/errors.py` | the one JSON error shape `{code, message, retryAfter?, retryAt?}` |
| `tests/unit`, `tests/api`, `tests/contract`, `tests/test_*.py` | M1 unit, M1 API, store contract, M0 suites |

## Environment

M0:

| Variable | Default |
|---|---|
| `APP_ENV` | `development` (`test`, `production`; HSTS only in production) |
| `PUBLIC_ORIGIN` | `http://127.0.0.1:10000` |
| `PORT` | `10000` |
| `PUBLIC_DIR` | `site/server/public` |
| `HUBS_DIR` | `site/build` (falls back to `<server>/build`, the Docker layout, when that exists instead) |
| `GIT_COMMIT` / `RENDER_GIT_COMMIT` | `dev` |
| `LOG_LEVEL` | `INFO` |

M1 (build-contracts section 8). **Production needs at least `SECRET_KEY` (≥ 32
bytes), `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_CONFIG` and a service-account key**
(`GOOGLE_APPLICATION_CREDENTIALS` as a Render Secret File, or
`FIREBASE_SERVICE_ACCOUNT_B64`); without the first three it refuses to start.

| Variable | Default |
|---|---|
| `AUTH_MODE` | `firebase` in production, else `fake` (refused in production) |
| `STORE` | `firestore` in production, else `memory` (refused in production) |
| `SECRET_KEY` | dev/test: a fixed key plus a warning |
| `SESSION_DAYS` | `14` |
| `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_CONFIG` | – (`{"apiKey","authDomain","projectId","appId"}`) |
| `GOOGLE_APPLICATION_CREDENTIALS` / `FIREBASE_SERVICE_ACCOUNT_B64` | – (else Application Default Credentials) |
| `FIRESTORE_EMULATOR_HOST` | – (tests only; refused in production) |
| `TRUSTED_PROXY_HOPS` | `1` in production, else `0` |
| `SYNC_TIERS` | `0.5:120:0:60,0.8:300:60:120,1.0:900:60:300` |
| `QUOTA_ENFORCE`, `QUOTA_TZ`, `QUOTA_READS`, `QUOTA_WRITES`, `QUOTA_DELETES`, `QUOTA_RESERVE` | `1`, `America/Los_Angeles`, `50000`, `20000`, `20000`, `0.05` |
| `MAX_PART_GZ`, `MAX_DOC_GZ`, `MAX_BODY`, `MAX_BODY_DECOMPRESSED` | `131072`, `393216`, `2097152`, `8388608` |
| `CLOCK_SKEW_MS`, `USER_WRITES_PER_DAY` | `900000`, `300` |
| `MAINTENANCE_FORCE` | unset (`read_only` or `full`) |

## Dependencies

`requirements.in` / `requirements-dev.in` hold the exact direct pins (tests use
`httpx2`, which Starlette 1.7's TestClient prefers over `httpx`). The `.txt`
files are compiled with hashes for Python 3.12 (the Docker image), considering only
releases at least two weeks old at lock time:

```bash
.venv/bin/pip-compile --generate-hashes --allow-unsafe --strip-extras \
  --pip-args "--uploaded-prior-to 2026-09-27T00:00:00Z" -o requirements.txt requirements.in
.venv/bin/pip-compile --generate-hashes --allow-unsafe --strip-extras \
  --pip-args "--uploaded-prior-to 2026-09-27T00:00:00Z" -o requirements-dev.txt requirements-dev.in
```

Check that every pinned wheel exists for the image (CPython 3.12, manylinux):

```bash
.venv/bin/pip download --require-hashes --only-binary=:all: --python-version 3.12 \
  --platform manylinux2014_x86_64 --implementation cp --abi cp312 -r requirements.txt -d /tmp/wheels
```
