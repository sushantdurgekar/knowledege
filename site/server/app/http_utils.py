"""Small response helpers shared by the hub and static routes."""

from __future__ import annotations

import re
import unicodedata
from urllib.parse import quote

from starlette.requests import Request
from starlette.responses import Response

# Browsers cache a bare 301 forever; an hour keeps a later catalog change fixable.
REDIRECT_CACHE = "public, max-age=3600"
# Visible ASCII only: anything else in a query string is dropped from the redirect.
_SAFE_QUERY_RE = re.compile(rb"[\x21-\x7e]*")
# RFC 5987 attr-char minus ALPHA / DIGIT (which quote() keeps anyway).
_ATTR_CHAR_SAFE = "!#$&+-.^_`|~"


def permanent_redirect(request: Request, location: str) -> Response:
    """301 to `location`, an absolute path the caller built from catalog data.

    The original query string is carried over; the fragment never reaches the server
    and browsers keep it across the redirect, so hub `#hash` deep links survive.
    """
    query = request.scope.get("query_string", b"")
    if query and _SAFE_QUERY_RE.fullmatch(query):
        location = f"{location}?{query.decode('ascii')}"
    return Response(status_code=301, headers={"Location": location, "Cache-Control": REDIRECT_CACHE})


def _ascii_fallback(name: str) -> str:
    out = []
    for char in name:
        ascii_part = unicodedata.normalize("NFKD", char).encode("ascii", "ignore").decode("ascii")
        out.append(ascii_part or "_")
    # Inside a quoted-string `"` and `\` would need escaping and `%` is decoded by some
    # browsers, so swap them for `_` instead.
    fallback = re.sub(r'["\\%]', "_", "".join(out))
    return fallback if fallback.strip(" ._") else "download.html"


def content_disposition(filename: str) -> str:
    """`attachment` with an ASCII `filename` and an RFC 5987 `filename*` (RFC 6266)."""
    # Drop control characters and path separators; fall back to a neutral name.
    name = "".join(ch for ch in filename if ch.isprintable() and ch not in "/\\").strip()
    if not name:
        name = "download.html"
    encoded = quote(name, safe=_ATTR_CHAR_SAFE, encoding="utf-8")
    return f"attachment; filename=\"{_ascii_fallback(name)}\"; filename*=UTF-8''{encoded}"
