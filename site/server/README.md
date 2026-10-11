# Study Hubs server

FastAPI backend for the Study Hubs site. It serves the hub files from the collector
output, the React shell from `public/`, and the JSON API. Interfaces are fixed in
[`../docs/build-contracts.md`](../docs/build-contracts.md) (section 5 for routes and headers).

## Develop

```bash
cd site/server
python3.12 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt     # hash-checked
.venv/bin/ruff check . && .venv/bin/ruff format --check .
.venv/bin/pytest
.venv/bin/uvicorn app.main:app --port 10000 --reload
```

Build the bridge, the client and the collector output first (see the contract,
section 2) or the server starts anyway and answers `/h/*` with a 503 page.

## Layout

| Path | What |
|---|---|
| `app/main.py` | `create_app(settings)` factory and the module-level `app` |
| `app/config.py` | `Settings.from_env()` |
| `app/catalog.py` | loads and validates `catalog.internal.json` |
| `app/precompressed.py` | br/gzip negotiation, sha256 ETags, 304s, scanned allow-lists |
| `app/hubs_routes.py` | `/h/{slug}`, `/h/{slug}/download`, `/catalog.json` |
| `app/static_routes.py` | `/_sh/*`, `/assets/*`, `/robots.txt`, SPA routes and the catch-all |
| `app/api_routes.py`, `app/progress/seed.py` | `/healthz`, `/api/version`, `/api/me`, `/api/seed/{id}.js` |
| `app/security.py`, `app/api_gzip.py` | global headers; gzip for `/api` only |
| `app/errors.py` | the one JSON error shape |
| `app/{auth,progress,store,quota,backup,jobs,admin,account}/` | M1–M3 packages |

## Environment

| Variable | Default |
|---|---|
| `APP_ENV` | `development` (`test`, `production`; HSTS only in production) |
| `PUBLIC_ORIGIN` | `http://127.0.0.1:10000` |
| `PORT` | `10000` |
| `PUBLIC_DIR` | `site/server/public` |
| `HUBS_DIR` | `site/build` (falls back to `<server>/build`, the Docker layout, when that exists instead) |
| `GIT_COMMIT` / `RENDER_GIT_COMMIT` | `dev` |
| `LOG_LEVEL` | `INFO` |

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
