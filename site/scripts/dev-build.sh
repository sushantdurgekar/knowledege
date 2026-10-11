#!/bin/sh
# dev-build.sh: full local build of the Study Hubs site, in the same order as the
# Dockerfile (build-contracts.md section 2): bridge -> client -> collector, plus the
# server's virtualenv so `make serve` / dev-e2e.sh can start uvicorn.
#
#   sh site/scripts/dev-build.sh [--install] [--strict] [--no-server]
#
#   --install    always run `npm ci` / `pip install` (default: only when missing)
#   --strict     collector exits non-zero on any rejected hub (what CI and Docker do)
#   --no-server  skip the server virtualenv
#
# Env: PYTHON (default: python3.12, else python3). Works from any directory.
set -eu

ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
SITE="$ROOT/site"

INSTALL=0
STRICT=""
SERVER=1
for arg in "$@"; do
  case "$arg" in
    --install) INSTALL=1 ;;
    --strict) STRICT="--strict" ;;
    --no-server) SERVER=0 ;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "dev-build: unknown option $arg" >&2; exit 2 ;;
  esac
done

step() { printf '\n==> %s\n' "$*"; }

# npm ci in $1 unless node_modules is already there (or --install was given).
npm_deps() {
  if [ "$INSTALL" = 1 ] || [ ! -d "$1/node_modules" ]; then
    (cd "$1" && npm ci --no-audit --no-fund)
  fi
}

step "bridge: build -> site/server/public/_sh/"
npm_deps "$SITE/bridge"
(cd "$SITE/bridge" && npm run build)

step "client: build -> site/server/public/"
npm_deps "$SITE/client"
(cd "$SITE/client" && npm run build)

step "collector: hubs -> site/build/"
# shellcheck disable=SC2086  # $STRICT is empty or one flag
(cd "$ROOT" && node site/scripts/collect-hubs.mjs --src . --config site/hubs.config.json --out site/build $STRICT)

if [ "$SERVER" = 1 ]; then
  VENV="$SITE/server/.venv"
  if [ "$INSTALL" = 1 ] || [ ! -x "$VENV/bin/uvicorn" ]; then
    step "server: virtualenv + hash-locked dev requirements"
    if [ -z "${PYTHON:-}" ]; then
      if command -v python3.12 >/dev/null 2>&1; then PYTHON=python3.12; else PYTHON=python3; fi
    fi
    [ -d "$VENV" ] || "$PYTHON" -m venv "$VENV"
    "$VENV/bin/pip" install --disable-pip-version-check -q -r "$SITE/server/requirements-dev.txt"
  fi
fi

step "done. Start the server with: make -C site serve   (or sh site/scripts/dev-e2e.sh to run the e2e suite)"
