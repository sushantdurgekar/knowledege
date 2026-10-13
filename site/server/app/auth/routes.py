"""GET /api/config, GET /api/me, POST /api/auth/session, POST /api/auth/logout
(build-contracts.md section 9).
"""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from starlette.responses import Response

from app import __version__
from app.admin.auth import is_admin
from app.auth import ratelimit
from app.auth.csrf import csrf_protect
from app.auth.deps import get_viewer
from app.auth.identity import AuthError, AuthUnavailable, Identity
from app.auth.session import (
    clear_session_cookies,
    public_id,
    session_cookie_name,
    set_session_cookies,
)
from app.errors import ApiError
from app.progress.validate import loads, read_body
from app.runtime import Runtime, get_runtime
from app.store.base import StoreError, UserRecord

logger = logging.getLogger(__name__)

NO_STORE = {"Cache-Control": "no-store"}
MAX_LOGIN_AGE_S = 300  # the ID token's sign-in must be this recent
MAX_SESSION_BODY = 16 * 1024

router = APIRouter()


@router.get("/api/config")
async def config(request: Request) -> JSONResponse:
    settings = get_runtime(request).settings
    web = settings.firebase_web_config
    body = {
        "authMode": settings.auth_mode,
        "firebase": web.to_json() if web is not None and settings.auth_mode == "firebase" else None,
        "origin": settings.public_origin,
        "version": __version__,
    }
    return JSONResponse(body, headers={"Cache-Control": "no-cache"})


@router.get("/api/me")
async def me(request: Request) -> JSONResponse:
    """Who is signed in (0 store reads: everything comes from the verified session, the
    cached site settings and the scheduler's cached jobs)."""
    viewer = await get_viewer(request)
    if viewer.identity is None or viewer.public_id is None:
        return JSONResponse({"signedIn": False}, headers=NO_STORE)
    runtime = get_runtime(request)
    user = viewer.identity.profile(viewer.public_id)
    user["admin"] = is_admin(runtime.settings, viewer.identity)  # display only: admin routes re-check
    body = {
        "signedIn": True,
        "user": user,
        "maintenance": runtime.maintenance(),
        "upcoming": runtime.upcoming(),
        "policy": runtime.guard.policy(viewer.identity.uid).to_json(),
    }
    return JSONResponse(body, headers=NO_STORE)


def _limit_sign_in(runtime: Runtime, ip: str) -> None:
    wait = runtime.limiter.hit("ip:" + ip, ratelimit.SESSION_PER_MINUTE, ratelimit.SESSION_PER_DAY)
    if wait is not None:
        now = runtime.clock.now()
        raise ApiError(
            429,
            "rate_limited",
            "Too many sign-in attempts, try again later",
            retry_after=wait,
            retry_at=now + timedelta(seconds=wait),
            now=now,
        )


def _upsert_user(runtime: Runtime, identity: Identity) -> None:
    """Record the user (lastLoginAt at most once per 24 h). Best effort: a store outage
    or a spent quota must not block signing in, since sync never needs the user doc."""
    record = UserRecord(
        uid=identity.uid,
        email=identity.email,
        email_verified=identity.email_verified,
        name=identity.name,
        photo=identity.photo,
        provider=identity.provider,
        last_login_at=runtime.clock.now(),
    )
    try:
        runtime.store.upsert_user(record, touch_login=True)
    except StoreError as exc:
        logger.warning("User upsert skipped for this sign-in: %s", exc)


@router.post("/api/auth/session", dependencies=[Depends(csrf_protect)])
async def create_session(request: Request) -> JSONResponse:
    runtime = get_runtime(request)
    settings = runtime.settings
    if runtime.maintenance_mode == "full":
        raise ApiError(503, "maintenance", "Signing in is paused for maintenance", retry_after=300)
    _limit_sign_in(runtime, ratelimit.client_ip(request, settings.trusted_proxy_hops or 0))

    data: Any = loads(await read_body(request, max_wire=MAX_SESSION_BODY, max_decompressed=MAX_SESSION_BODY))
    id_token = data.get("idToken") if isinstance(data, dict) else None
    if not isinstance(id_token, str) or not id_token:
        raise ApiError(401, "invalid_token", "Sign-in failed")
    try:
        identity = await run_in_threadpool(runtime.auth.verify_id_token, id_token)
    except AuthError:
        raise ApiError(401, "invalid_token", "Sign-in failed") from None
    except AuthUnavailable:
        raise ApiError(503, "unavailable", "Sign-in is unavailable right now", retry_after=30) from None

    if identity.auth_time is None or runtime.clock.now_s() - identity.auth_time > MAX_LOGIN_AGE_S:
        raise ApiError(403, "stale_login", "Please sign in again")
    if identity.needs_verification:
        raise ApiError(403, "email_unverified", "Verify your email address, then sign in again")

    if runtime.maintenance_mode != "read_only":  # read-only: the upsert is deferred
        await run_in_threadpool(_upsert_user, runtime, identity)
    try:
        session = await run_in_threadpool(runtime.auth.create_session, id_token, identity)
    except AuthError:
        raise ApiError(401, "invalid_token", "Sign-in failed") from None
    except AuthUnavailable:
        raise ApiError(503, "unavailable", "Sign-in is unavailable right now", retry_after=30) from None

    # A fresh ID token means the account exists again (fake mode reuses uids after DELETE /api/me).
    runtime.deleted_uids.discard(identity.uid)
    pid = public_id(settings.secret, identity.uid)
    response = JSONResponse({"user": identity.profile(pid)}, headers=NO_STORE)
    set_session_cookies(response, settings, session, pid)
    return response


@router.post("/api/auth/logout", dependencies=[Depends(csrf_protect)])
async def logout(request: Request) -> Response:
    runtime = get_runtime(request)
    cookie = request.cookies.get(session_cookie_name(runtime.settings))
    if cookie:
        runtime.auth.forget(cookie)
    response = Response(status_code=204, headers=NO_STORE)
    clear_session_cookies(response, runtime.settings)
    return response
