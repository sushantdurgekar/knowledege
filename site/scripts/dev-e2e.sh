#!/bin/sh
# dev-e2e.sh: run the Playwright suite in site/e2e against a local uvicorn.
#
#   sh site/scripts/dev-e2e.sh [playwright args...]      e.g.  --grep @smoke   or   tests/ai.spec.ts
#
# Starts `uvicorn app.main:app` (APP_ENV=test) on $PORT unless something already
# answers $BASE_URL/healthz, waits for /healthz, runs `npx playwright test "$@"`,
# then stops the server it started. Build first (sh site/scripts/dev-build.sh).
#
# Env: PORT (10000), BASE_URL (http://127.0.0.1:$PORT), APP_ENV (test),
#      HEALTH_TIMEOUT seconds (30). The server log goes to site/e2e/server.log.
set -eu

ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
SITE="$ROOT/site"
PORT=${PORT:-10000}
BASE_URL=${BASE_URL:-http://127.0.0.1:$PORT}
HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-30}
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
    APP_ENV=${APP_ENV:-test} PUBLIC_ORIGIN="$BASE_URL" \
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
