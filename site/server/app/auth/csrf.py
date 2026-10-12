"""CSRF guard for state-changing API calls (build-contracts.md section 9).

Every `/api/*` request that is not GET, HEAD or OPTIONS must carry `X-StudyHubs: 1`
and `Origin` equal to PUBLIC_ORIGIN, byte for byte. When a browser sends no Origin,
`Sec-Fetch-Site: same-origin` is accepted instead. Anything else is 403 `csrf`.
There are no CORS headers anywhere, so a cross-site page cannot even read a reply.

It is a route dependency (`Depends(csrf_protect)` on every non-GET API route; a test
walks the route table to prove it), so unknown endpoints still answer 404 and wrong
methods 405.
"""

from __future__ import annotations

from starlette.requests import Request

from app.errors import ApiError
from app.runtime import get_runtime

PROTOCOL_HEADER = "x-studyhubs"
PROTOCOL_VERSION = "1"
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


def csrf_problem(method: str, headers: dict[str, str] | object, public_origin: str) -> str | None:
    """Why the request fails the CSRF rule, or None when it passes."""
    get = headers.get  # type: ignore[attr-defined]
    if method.upper() in SAFE_METHODS:
        return None
    if get(PROTOCOL_HEADER) != PROTOCOL_VERSION:
        return "missing X-StudyHubs header"
    origin = get("origin")
    if origin is not None:
        return None if origin == public_origin else "cross-origin request"
    if get("sec-fetch-site") == "same-origin":
        return None
    return "missing Origin"


async def csrf_protect(request: Request) -> None:
    problem = csrf_problem(request.method, request.headers, get_runtime(request).settings.public_origin)
    if problem is not None:
        raise ApiError(403, "csrf", f"Request refused: {problem}")
