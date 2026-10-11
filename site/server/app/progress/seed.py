"""GET /api/seed/{hubId}.js: the synchronous seed script for legacy hubs (AI-901).

The collector injects `<script src="/api/seed/<id>.js">` right after the bridge in
legacy hubs, so it runs before the hub reads its localStorage. In M0 everyone is
anonymous and the body only tells the bridge so; M1 returns the signed-in user's
server copy here (hub-runtime-contract.md, "The seed must be available synchronously").
"""

from __future__ import annotations

from fastapi import APIRouter, Request
from starlette.responses import Response

from app.state import get_state

ANONYMOUS_SEED = "window.__studyhubsBridge&&__studyhubsBridge.legacySeed({signedIn:false});"
JS = "text/javascript"
# Per-user content in M1: never cached, and varies with the session cookie.
SEED_HEADERS = {"Cache-Control": "no-store", "Vary": "Cookie"}

router = APIRouter()


def _js(body: str, status_code: int = 200) -> Response:
    return Response(body, status_code=status_code, media_type=JS, headers=SEED_HEADERS)


@router.get("/api/seed/{hub_id}.js")
async def legacy_seed(request: Request, hub_id: str) -> Response:
    catalog = get_state(request).catalog
    if catalog is None:
        return _js("/* hub catalog unavailable */\n", 503)
    hub = catalog.by_id.get(hub_id)
    if hub is None or hub.engine != "legacy":
        return _js("/* unknown or non-legacy hub */\n", 404)
    return _js(ANONYMOUS_SEED)
