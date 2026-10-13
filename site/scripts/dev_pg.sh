#!/bin/sh
# dev_pg.sh: a throwaway local Postgres 16 for the Postgres store tests (build-contracts.md §23).
#
#   sh site/scripts/dev_pg.sh            start (initdb + pg_ctl in a temp dir, port 54329), print the URL
#   sh site/scripts/dev_pg.sh url        print the URL of the running instance
#   sh site/scripts/dev_pg.sh stop       stop it and delete its data directory
#
# Then:  export DATABASE_URL_TEST=$(sh site/scripts/dev_pg.sh url)
#        cd site/server && .venv/bin/pytest tests/contract        (REQUIRE_PG=1 to fail instead of skip)
#
# The cluster trusts local connections (user postgres, no password), keeps its socket in
# the data directory, listens on 127.0.0.1 only and runs with fsync off: test data only.
# initdb refuses to run as root, so as root the server runs as the `postgres` system user.
#
# Env: PG_PORT (54329), PG_BIN (/usr/lib/postgresql/16/bin), PG_DB (studyhubs_test).
set -eu

PG_PORT=${PG_PORT:-54329}
PG_BIN=${PG_BIN:-/usr/lib/postgresql/16/bin}
PG_DB=${PG_DB:-studyhubs_test}
STATE="${TMPDIR:-/tmp}/studyhubs-pg-$PG_PORT.dir"  # holds the data directory's path
URL="postgresql://postgres@127.0.0.1:$PG_PORT/$PG_DB"

as_owner() {
  if [ "$(id -u)" = 0 ]; then
    runuser -u postgres -- "$@"
  else
    "$@"
  fi
}

running_dir() {
  [ -f "$STATE" ] || return 1
  dir=$(cat "$STATE")
  [ -d "$dir/data" ] && as_owner "$PG_BIN/pg_ctl" -D "$dir/data" status >/dev/null 2>&1 && echo "$dir"
}

cmd=${1:-start}
case "$cmd" in
  start)
    if dir=$(running_dir); then
      echo "$URL"
      exit 0
    fi
    [ -x "$PG_BIN/initdb" ] || { echo "dev_pg.sh: no initdb in $PG_BIN (set PG_BIN)" >&2; exit 2; }
    dir=$(mktemp -d "${TMPDIR:-/tmp}/studyhubs-pg.XXXXXX")
    if [ "$(id -u)" = 0 ]; then
      chown postgres "$dir"
    fi
    as_owner "$PG_BIN/initdb" -D "$dir/data" -U postgres -A trust -E UTF8 --no-sync >"$dir/initdb.log" 2>&1 || {
      cat "$dir/initdb.log" >&2
      exit 1
    }
    as_owner "$PG_BIN/pg_ctl" -D "$dir/data" -l "$dir/data/server.log" -w -t 30 \
      -o "-p $PG_PORT -k $dir/data -c listen_addresses=127.0.0.1 -c fsync=off -c synchronous_commit=off -c full_page_writes=off -c max_connections=60" \
      start >/dev/null
    echo "$dir" >"$STATE"
    as_owner "$PG_BIN/createdb" -h 127.0.0.1 -p "$PG_PORT" -U postgres "$PG_DB"
    echo "$URL"
    ;;
  url)
    running_dir >/dev/null || { echo "dev_pg.sh: not running (start it first)" >&2; exit 1; }
    echo "$URL"
    ;;
  stop)
    if dir=$(running_dir); then
      as_owner "$PG_BIN/pg_ctl" -D "$dir/data" -m fast -w stop >/dev/null
    fi
    if [ -f "$STATE" ]; then
      dir=$(cat "$STATE")
      case "$dir" in
        "${TMPDIR:-/tmp}"/studyhubs-pg.*) rm -rf "$dir" ;;
      esac
      rm -f "$STATE"
    fi
    ;;
  *)
    echo "usage: dev_pg.sh [start|url|stop]" >&2
    exit 2
    ;;
esac
