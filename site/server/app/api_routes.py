"""Health and the small M0 JSON endpoints.

M1 replaces /api/me with the session-aware version (auth/) and adds /api/config.
"""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app import __version__
from app.state import get_state

NO_STORE = {"Cache-Control": "no-store"}

router = APIRouter()


@router.api_route("/healthz", methods=["GET", "HEAD"], include_in_schema=False)
async def healthz() -> JSONResponse:
    """Liveness for Render and the uptime pinger: no catalog, no database."""
    return JSONResponse({"ok": True}, headers=NO_STORE)


@router.get("/api/version")
async def version(request: Request) -> JSONResponse:
    return JSONResponse(
        {"version": __version__, "commit": get_state(request).settings.git_commit}, headers=NO_STORE
    )


@router.get("/api/me")
async def me() -> JSONResponse:
    """M0 has no accounts: everyone is anonymous."""
    return JSONResponse({"signedIn": False}, headers=NO_STORE)
