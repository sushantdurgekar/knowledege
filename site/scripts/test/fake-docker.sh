#!/usr/bin/env bash
# Stand-in for the docker CLI, used only by check-image.test.mjs.
# The "image" filesystem is the directory $FAKE_ROOT; the only image name is $FAKE_IMAGE.
# FAKE_FIND_FAIL=1 makes `docker run` fail so check-image.sh takes its export fallback.
set -euo pipefail
cmd=${1:?}; shift
case "$cmd" in
  image)
    [ "${1:-}" = inspect ] && [ "${2:-}" = "${FAKE_IMAGE:-fake/image:test}" ] ;;
  create)
    [ "${1:-}" = "${FAKE_IMAGE:-fake/image:test}" ] || { echo "no such image" >&2; exit 1; }
    echo fake-container-id ;;
  rm)
    exit 0 ;;
  cp)
    src=${1:?} dest=${2:?}
    p=${src#*:}
    [ -f "$FAKE_ROOT$p" ] || { echo "Error: could not find the file $p in container" >&2; exit 1; }
    cp "$FAKE_ROOT$p" "$dest" ;;
  run)
    if [ -n "${FAKE_FIND_FAIL:-}" ]; then echo 'exec: "find": executable file not found' >&2; exit 127; fi
    ep=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --rm) shift ;;
        --entrypoint) ep=$2; shift 2 ;;
        --network|--user) shift 2 ;;
        *) break ;;
      esac
    done
    shift # image
    dir=${1:?}; shift
    exec "$ep" "$FAKE_ROOT$dir" "$@" ;;
  export)
    tar -C "$FAKE_ROOT" -cf - . ;;
  *)
    echo "fake-docker: unsupported command $cmd" >&2; exit 1 ;;
esac
