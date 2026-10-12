"""GET /api/seed/{hubId}.js: the synchronous seed script for legacy hubs (AI-901).

The collector injects `<script src="/api/seed/<id>.js">` right after the bridge in
legacy hubs, so it runs before the hub reads its localStorage
(hub-runtime-contract.md, "The seed must be available synchronously").

- Anonymous (or an invalid session, whose cookies are then cleared): the M0 body,
  `legacySeed({signedIn:false})`.
- Signed in: `legacySeed({"signedIn":true,"publicId":…,"policy":{…},"parts":{"legacy":{"upd","raw"}}|{}})`,
  1 store read.
- Maintenance `full`, a store outage or an open quota breaker: 503 with a JS comment.
  The script then fails to load and the bridge never gets a seed, so the hub stays
  local for this visit (no stale server copy is ever presented as current).
- Headers: `no-store`, `Vary: Cookie`, `Cross-Origin-Resource-Policy: same-origin`.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Request
from starlette.concurrency import run_in_threadpool
from starlette.responses import Response

from app.auth import ratelimit
from app.auth.deps import get_viewer
from app.errors import ApiError
from app.runtime import get_runtime
from app.state import get_state

ANONYMOUS_SEED = "window.__studyhubsBridge&&__studyhubsBridge.legacySeed({signedIn:false});"
JS = "text/javascript"
# Per-user content: never cached, varies with the session cookie, same-origin only.
SEED_HEADERS = {"Cache-Control": "no-store", "Vary": "Cookie", "Cross-Origin-Resource-Policy": "same-origin"}

router = APIRouter()


def _js(body: str, status_code: int = 200) -> Response:
    return Response(body, status_code=status_code, media_type=JS, headers=SEED_HEADERS)


def js_literal(value: Any) -> str:
    """JSON that is also safe inside any script context (no `<`, `>`, `&`, U+2028/9)."""
    text = json.dumps(value, ensure_ascii=True, separators=(",", ":"))
    return text.replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")


def signed_in_seed(config: dict[str, Any]) -> str:
    return f"window.__studyhubsBridge&&__studyhubsBridge.legacySeed({js_literal(config)});"


@router.get("/api/seed/{hub_id}.js")
async def legacy_seed(request: Request, hub_id: str) -> Response:
    catalog = get_state(request).catalog
    if catalog is None:
        return _js("/* hub catalog unavailable */\n", 503)
    hub = catalog.by_id.get(hub_id)
    if hub is None or hub.engine != "legacy":
        return _js("/* unknown or non-legacy hub */\n", 404)
    try:
        viewer = await get_viewer(request)
    except ApiError:
        return _js("/* sign-in check unavailable */\n", 503)
    if viewer.identity is None:
        return _js(ANONYMOUS_SEED)

    runtime = get_runtime(request)
    if runtime.maintenance_mode == "full":
        return _js("/* maintenance */\n", 503)
    uid = viewer.identity.uid
    if runtime.limiter.hit("uid:" + uid, ratelimit.SEED) is not None:
        return _js("/* rate limited */\n", 429)
    if runtime.guard.read_block() is not None:
        return _js("/* sync paused */\n", 503)
    try:
        parts = await run_in_threadpool(runtime.progress.get_parts, uid, hub, {})
    except ApiError:
        return _js("/* sync unavailable */\n", 503)
    legacy = parts.get("legacy")
    seed_parts: dict[str, Any] = {}
    if isinstance(legacy, dict) and isinstance(legacy.get("raw"), str):
        seed_parts["legacy"] = {"upd": legacy.get("upd"), "raw": legacy["raw"]}
    config = {
        "signedIn": True,
        "publicId": viewer.public_id,
        "policy": runtime.guard.policy(uid).to_json(),
        "parts": seed_parts,
    }
    return _js(signed_in_seed(config))
