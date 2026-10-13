#!/bin/sh
# dev-e2e-pg.sh: run Playwright specs against a Postgres-backed uvicorn (build-contracts.md §26).
#
#   sh site/scripts/dev-e2e-pg.sh [playwright args...]     default: tests/m3-restore.spec.ts
#
# Starts the throwaway Postgres of scripts/dev_pg.sh unless one is running already (and then
# stops it again), and runs scripts/dev-e2e.sh with E2E_STORE=postgres and its DATABASE_URL.
# The server listens on PORT 10010 by default, so a memory-store server on 10000 is never
# mistaken for it; the specs also check the store kind through /api/admin/stats.
# Pass the whole suite's arguments to run every spec on Postgres (e.g. `--project=sync`).
#
# Env: PORT (10010), PG_PORT / PG_BIN / PG_DB (see dev_pg.sh), CI.
set -eu

SITE=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
PG_STARTED=""

# shellcheck disable=SC2317,SC2329  # invoked by the EXIT trap
cleanup() {
  if [ -n "$PG_STARTED" ]; then
    sh "$SITE/scripts/dev_pg.sh" stop || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

if ! DATABASE_URL=$(sh "$SITE/scripts/dev_pg.sh" url 2>/dev/null); then
  DATABASE_URL=$(sh "$SITE/scripts/dev_pg.sh" start)
  PG_STARTED=1
fi
echo "dev-e2e-pg: Postgres at $DATABASE_URL"

if [ "$#" -eq 0 ]; then
  set -- tests/m3-restore.spec.ts
fi
status=0
E2E_STORE=postgres DATABASE_URL="$DATABASE_URL" PORT="${PORT:-10010}" sh "$SITE/scripts/dev-e2e.sh" "$@" || status=$?
exit "$status"
