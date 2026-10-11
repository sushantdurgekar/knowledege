#!/usr/bin/env bash
# check-image.sh: fail when the built image holds anything that must never ship.
#
#   site/scripts/check-image.sh <image>
#   site/scripts/check-image.sh --listing <file> --catalog <catalog.json>    # offline mode (tests)
#
# It lists every entry under $APP_DIR (default /app) in the image and fails on:
#   - any *.md file
#   - any path segment _meta, sessions, practice, work, courses, technical or .git
#   - any .env / .env.* file (except *.example)
#   - any file under a hubs/ folder that is not build/hubs/<slug>/<one of the 6 outputs>
#     for a slug listed in build/catalog.json
# and it also fails when a catalog hub is missing one of its 6 files, or when
# build/catalog.json or build/catalog.internal.json is missing.
#
# Listing: `docker run --entrypoint find` (GNU find in python:3.12-slim); when that
# cannot run, it falls back to `docker export` of a created container, which needs
# nothing inside the image. The catalog is copied out with `docker cp`.
# The listing file format (offline mode) is one entry per line: "<type>\t<path>",
# type "d" for directories and anything else for files, path relative to $APP_DIR.
#
# Env: DOCKER (default: docker), APP_DIR (default: /app).
# Exit codes: 0 ok, 1 violations, 2 usage or environment error.

set -euo pipefail

DOCKER=${DOCKER:-docker}
APP_DIR=${APP_DIR:-/app}
APP_DIR=${APP_DIR%/}

die() { echo "check-image: $*" >&2; exit 2; }
usage() { sed -n '3,4p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }

if [ -z "${BASH_VERSINFO:-}" ] || [ "${BASH_VERSINFO[0]}" -lt 4 ]; then
  die "needs bash 4 or newer"
fi

IMAGE="" LISTING="" CATALOG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --listing) LISTING=${2:-}; shift 2 || usage ;;
    --catalog) CATALOG=${2:-}; shift 2 || usage ;;
    -h|--help) usage ;;
    -*) echo "check-image: unknown option $1" >&2; usage ;;
    *) [ -z "$IMAGE" ] || usage; IMAGE=$1; shift ;;
  esac
done

TMP=$(mktemp -d)
CID=""
cleanup() {
  if [ -n "$CID" ]; then "$DOCKER" rm -f "$CID" >/dev/null 2>&1 || true; fi
  rm -rf "$TMP"
}
trap cleanup EXIT

# ── gather the listing and the catalog ────────────────────────────────────────
if [ -n "$IMAGE" ]; then
  [ -z "$LISTING$CATALOG" ] || die "give either <image> or --listing/--catalog, not both"
  command -v "$DOCKER" >/dev/null 2>&1 || die "'$DOCKER' not found"
  "$DOCKER" image inspect "$IMAGE" >/dev/null 2>&1 || die "image '$IMAGE' not found"

  # A command is passed so images without CMD can be created too; the container never starts.
  CID=$("$DOCKER" create "$IMAGE" true) || die "cannot create a container from '$IMAGE'"
  if ! "$DOCKER" cp "$CID:$APP_DIR/build/catalog.json" "$TMP/catalog.json" >/dev/null 2>&1; then
    echo "check-image: FAIL: $APP_DIR/build/catalog.json is missing from the image" >&2
    exit 1
  fi
  CATALOG="$TMP/catalog.json"

  LISTING="$TMP/listing.txt"
  if ! "$DOCKER" run --rm --network none --user 0:0 --entrypoint find "$IMAGE" \
        "$APP_DIR" -mindepth 1 -printf '%y\t%P\n' >"$LISTING" 2>"$TMP/find.err"; then
    echo "check-image: 'find' in the image failed ($(head -c 200 "$TMP/find.err")); falling back to docker export" >&2
    prefix="${APP_DIR#/}/"
    "$DOCKER" export "$CID" | tar -tf - >"$TMP/tar.txt" || die "docker export failed"
    : >"$LISTING"
    while IFS= read -r p; do
      p=${p#./}
      case "$p" in "$prefix"?*) ;; *) continue ;; esac
      p=${p#"$prefix"}
      case "$p" in */) printf 'd\t%s\n' "${p%/}" ;; *) printf 'f\t%s\n' "$p" ;; esac
    done <"$TMP/tar.txt" >>"$LISTING"
  fi
else
  if [ -z "$LISTING" ] || [ -z "$CATALOG" ]; then usage; fi
  [ -f "$LISTING" ] || die "listing file '$LISTING' not found"
  [ -f "$CATALOG" ] || die "catalog file '$CATALOG' not found"
fi

[ -s "$LISTING" ] || { echo "check-image: FAIL: nothing found under $APP_DIR" >&2; exit 1; }

# ── catalog slugs ─────────────────────────────────────────────────────────────
catalog_slugs() {
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import json,sys
for h in json.load(open(sys.argv[1], encoding="utf-8"))["hubs"]: print(h["slug"])' "$1"
  elif command -v node >/dev/null 2>&1; then
    node -e 'for (const h of JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).hubs) console.log(h.slug)' "$1"
  elif command -v jq >/dev/null 2>&1; then
    jq -r '.hubs[].slug' "$1"
  else
    die "need python3, node or jq to read the catalog"
  fi
}

slugs_out=$(catalog_slugs "$CATALOG") || die "cannot parse catalog '$CATALOG'"
declare -A SLUG=()
while IFS= read -r s; do
  [ -n "$s" ] || continue
  [[ "$s" =~ ^[a-z0-9][a-z0-9-]*$ ]] || die "catalog has an invalid slug '$s'"
  SLUG[$s]=1
done <<<"$slugs_out"

# ── checks ────────────────────────────────────────────────────────────────────
declare -A SEEN=()
HUB_FILES="index.html index.html.br index.html.gz original.html original.html.br original.html.gz"
violations=()
entries=0
hub_files=0

while IFS= read -r line || [ -n "$line" ]; do
  [ -n "$line" ] || continue
  entries=$((entries + 1))
  if [[ ! "$line" =~ ^([a-zA-Z])$'\t'(.+)$ ]]; then
    violations+=("unparseable listing entry: ${line:0:120}")
    continue
  fi
  type=${BASH_REMATCH[1]}
  rel=${BASH_REMATCH[2]}
  SEEN[$rel]=$type
  lower=${rel,,}
  base=${rel##*/}

  IFS='/' read -r -a segs <<<"$lower"
  for seg in "${segs[@]}"; do
    case "$seg" in
      _meta|sessions|practice|work|courses|technical|.git)
        violations+=("$rel: private folder '$seg'"); continue 2 ;;
    esac
  done

  if [ "$type" != d ]; then
    case "$lower" in *.md) violations+=("$rel: markdown file"); continue ;; esac
    case "$base" in
      *.example) ;;
      .env|.env.*) violations+=("$rel: environment/secret file"); continue ;;
    esac
  fi

  # Anything inside a hubs/ folder must be one of the collector's outputs for a catalog slug.
  if [[ "/$lower/" == */hubs/* ]]; then
    if [[ "$rel" == build/hubs ]]; then
      continue
    elif [[ "$rel" =~ ^build/hubs/([^/]+)$ ]] && [ "$type" = d ] && [ -n "${SLUG[${BASH_REMATCH[1]}]:-}" ]; then
      continue
    elif [[ "$rel" =~ ^build/hubs/([^/]+)/([^/]+)$ ]] && [ "$type" != d ] \
        && [ -n "${SLUG[${BASH_REMATCH[1]}]:-}" ] && [[ " $HUB_FILES " == *" ${BASH_REMATCH[2]} "* ]]; then
      hub_files=$((hub_files + 1))
      continue
    fi
    violations+=("$rel: hubs/ entry that is not an output for a catalog hub")
  fi
done <"$LISTING"

for f in build/catalog.json build/catalog.internal.json; do
  [ -n "${SEEN[$f]:-}" ] || violations+=("$f: missing")
done
for s in "${!SLUG[@]}"; do
  for f in $HUB_FILES; do
    [ -n "${SEEN[build/hubs/$s/$f]:-}" ] || violations+=("build/hubs/$s/$f: missing for catalog hub '$s'")
  done
done

if [ ${#violations[@]} -gt 0 ]; then
  echo "check-image: FAIL, ${#violations[@]} problem(s) under $APP_DIR:" >&2
  printf '  %s\n' "${violations[@]:0:100}" >&2
  [ ${#violations[@]} -le 100 ] || echo "  … and $(( ${#violations[@]} - 100 )) more" >&2
  exit 1
fi
echo "check-image: ok ($entries entries under $APP_DIR, ${#SLUG[@]} catalog hub(s), $hub_files hub file(s))"
