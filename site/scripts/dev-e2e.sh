#!/bin/sh
# dev-e2e.sh: run the Playwright suite in site/e2e against a local uvicorn.
#
#   sh site/scripts/dev-e2e.sh [playwright args...]      e.g.  --grep @smoke   or   tests/ai.spec.ts
#
# Starts `uvicorn app.main:app` on $PORT unless something already answers
# $BASE_URL/healthz, waits for /healthz, runs `npx playwright test "$@"`, then stops the
# server it started. Build first (sh site/scripts/dev-build.sh).
#
# The server runs as the M1 suite needs it (build-contracts.md sections 8 and 15):
# APP_ENV=test (mounts /api/test/*), AUTH_MODE=fake (sign in with "fake:" tokens),
# STORE=memory (wiped by POST /api/test/reset) and a fixed test SECRET_KEY. A server you
# started yourself must run the same way, or the sync-*.spec.ts files fail.
#
# Env: PORT (10000), BASE_URL (http://127.0.0.1:$PORT), HEALTH_TIMEOUT seconds (30).
#      The server log goes to site/e2e/server.log.
set -eu

ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
SITE="$ROOT/site"
PORT=${PORT:-10000}
BASE_URL=${BASE_URL:-http://127.0.0.1:$PORT}
HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-30}
# Test-only signing key (>= 32 bytes; never used outside APP_ENV=test).
E2E_SECRET_KEY="e2e-only-secret-key-0123456789abcdef-not-for-production"
LOG="$SITE/e2e/server.log"
export BASE_URL

# Exit 0 when $BASE_URL/healthz answers 2xx (node is needed anyway; curl may not be).
healthy() {
  node -e 'fetch(process.argv[1], {signal: AbortSignal.timeout(2000)}).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))' \
    "$BASE_URL/healthz"
}

SERVER_PID=""
# shellcheck disable=SC2317,SC2329  # invoked by the EXIT trap (SC2329 on ShellCheck 0.11+)
cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

if healthy; then
  echo "dev-e2e: using the server already running at $BASE_URL"
else
  UVICORN="$SITE/server/.venv/bin/uvicorn"
  if [ ! -x "$UVICORN" ]; then
    echo "dev-e2e: $UVICORN not found; run: sh site/scripts/dev-build.sh" >&2
    exit 2
  fi
  echo "dev-e2e: starting uvicorn on 127.0.0.1:$PORT (log: $LOG)"
  (
    cd "$SITE/server"
    APP_ENV=test AUTH_MODE=fake STORE=memory PUBLIC_ORIGIN="http://127.0.0.1:$PORT" \
      SECRET_KEY="$E2E_SECRET_KEY" \
      exec "$UVICORN" app.main:app --host 127.0.0.1 --port "$PORT" --workers 1
  ) >"$LOG" 2>&1 &
  SERVER_PID=$!
  waited=0
  until healthy; do
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
      echo "dev-e2e: uvicorn exited; last log lines:" >&2
      tail -n 30 "$LOG" >&2 || true
      exit 1
    fi
    if [ "$waited" -ge "$HEALTH_TIMEOUT" ]; then
      echo "dev-e2e: $BASE_URL/healthz did not answer within ${HEALTH_TIMEOUT}s" >&2
      tail -n 30 "$LOG" >&2 || true
      exit 1
    fi
    sleep 1
    waited=$((waited + 1))
  done
fi

cd "$SITE/e2e"
if [ ! -d node_modules ]; then
  npm ci --no-audit --no-fund
fi
# Not `exec`: the EXIT trap must still stop the server afterwards.
status=0
npx playwright test "$@" || status=$?
exit "$status"
