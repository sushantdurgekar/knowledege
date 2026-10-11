# Study Hubs site image. Build from the REPO ROOT (the context is the whole vault,
# narrowed by the allow-list in /.dockerignore):
#
#   docker build -f site/Dockerfile -t study-hubs .
#   docker run --rm -p 10000:10000 -e APP_ENV=development study-hubs
#
# Stage 1 (web) builds the bridge and the React shell into site/server/public and
# runs the hub collector into /w/out. Stage 2 (app) is the runtime: Python, the
# FastAPI app and those two generated folders, nothing else. No vault file other
# than the published hub HTML ever reaches stage 2, and only as collector output.
#
# Base images are pinned by exact tag. For fully reproducible builds you can also
# pin the digest (FROM node:22.23.2-bookworm-slim@sha256:...); Renovate/Dependabot
# can keep both up to date.

############################  stage 1: web  ############################
FROM node:22.23.2-bookworm-slim AS web

ENV CI=true \
    npm_config_audit=false \
    npm_config_fund=false \
    npm_config_update_notifier=false
WORKDIR /w

# Dependencies first, so this layer is reused until a lockfile changes.
COPY site/bridge/package.json site/bridge/package-lock.json site/bridge/
COPY site/client/package.json site/client/package-lock.json site/client/
RUN cd site/bridge && npm ci \
 && cd ../client && npm ci

# Sources (node_modules, build output and caches are kept out by .dockerignore).
COPY site/ site/

# Bridge -> site/server/public/_sh/, then the client -> site/server/public/
# (Vite keeps _sh/; build-contracts.md section 2).
RUN cd site/bridge && npm run build \
 && cd ../client && npm run build

# Hubs: only the allow-listed hub files are in the context. verify-context.mjs
# proves the copied tree holds nothing else (the real guarantee, whatever the
# builder did with .dockerignore); the collector then injects the bridge, hashes
# inline scripts for the CSP, precompresses and writes the catalog. --strict
# fails the build on any rejected hub instead of silently leaving it out.
COPY technical/ /src/technical/
RUN node site/scripts/verify-context.mjs /src --config site/hubs.config.json \
 && node site/scripts/collect-hubs.mjs --src /src --config site/hubs.config.json --out /w/out --strict

############################  stage 2: app  ############################
FROM python:3.12.14-slim-bookworm AS app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    APP_ENV=production \
    PORT=10000 \
    PUBLIC_DIR=/app/public \
    HUBS_DIR=/app/build
WORKDIR /app

# Hash-locked runtime dependencies (pip-compile --generate-hashes). Wheels only:
# the slim image has no compiler, and a source build would mean an unpinned toolchain.
COPY site/server/requirements.txt /tmp/requirements.txt
RUN pip install --require-hashes --only-binary=:all: -r /tmp/requirements.txt \
 && rm /tmp/requirements.txt

# Application code and the two generated folders (root-owned, read-only for the app user).
# Bytecode is compiled now: the free instance has a fraction of a CPU, so cold starts count.
COPY site/server/app ./app
RUN python -m compileall -q app
COPY --from=web /w/site/server/public ./public
COPY --from=web /w/out ./build

# Unprivileged runtime user. /data is the only writable path (M2+ job state;
# Render's free plan has no persistent disk, so treat it as scratch there).
RUN useradd --system --uid 10001 --no-create-home --home-dir /nonexistent \
        --shell /usr/sbin/nologin app \
 && mkdir -p /data \
 && chown app /data
USER 10001

# The commit /api/version reports (the CI deploy job waits for it). CI passes
# --build-arg GIT_COMMIT; Render's RENDER_GIT_COMMIT is used when it reaches the
# build as an argument, and the server also reads it at runtime. An empty value
# counts as unset. Declared last so a new commit only rebuilds this layer.
ARG GIT_COMMIT=""
ARG RENDER_GIT_COMMIT=""
ENV GIT_COMMIT=${GIT_COMMIT:-${RENDER_GIT_COMMIT}}

EXPOSE 10000
# Render injects PORT (default 10000). One worker: the M1+ in-process scheduler
# and quota meter assume a single process. No --proxy-headers: with
# --forwarded-allow-ips='*' uvicorn would take the LEFT-most X-Forwarded-For entry,
# which the client controls. Nothing uses the client address or scheme (redirects
# are relative); M1's rate limiter reads the right-most hop Render appends itself.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port \"${PORT:-10000}\" --workers 1 --no-server-header --timeout-graceful-shutdown 20"]
