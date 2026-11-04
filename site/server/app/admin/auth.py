"""Admin authorization and the destructive-action rules (build-contracts.md section 17).

- **Admin:** the session's email is in ADMIN_EMAILS (case-insensitive), the email is
  verified and the sign-in provider is `google.com`. Admin routes re-verify the session
  with `check_revoked=True` (cached at most 60 s). Anyone else gets 404 `not_found`,
  exactly what an unknown /api path answers, so the routes' existence stays hidden.
- **Destructive actions** (a backup, entering `full` maintenance, cancelling a scheduled
  job, `DELETE /api/me`) also need a sign-in within 24 h (else 403 `reauth_required`)
  and `confirm` equal to the phrase the UI shows (else 422 `confirm_required`).
"""

from __future__ import annotations

from typing import Any

from starlette.concurrency import run_in_threadpool
from starlette.requests import Request

from app.auth import ratelimit
from app.auth.deps import Viewer, get_viewer
from app.auth.identity import AuthError, AuthUnavailable, Identity
from app.auth.session import session_cookie_name
from app.config import Settings
from app.errors import ApiError
from app.runtime import Runtime, get_runtime

REAUTH_WINDOW_S = 24 * 3600
ADMIN_RULE = ratelimit.Rule.per_minute("admin", 60)

# The typed confirmations (the UI shows these exact words).
CONFIRM_BACKUP = "BACKUP"
CONFIRM_DELETE_ACCOUNT = "DELETE"
CONFIRM_FULL_MAINTENANCE = "FULL"
CONFIRM_CANCEL_JOB = "CANCEL"


def is_admin(settings: Settings, identity: Identity | None) -> bool:
    return (
        identity is not None
        and identity.email_verified
        and identity.provider == "google.com"
        and settings.is_admin_email(identity.email)
    )


def not_found() -> ApiError:
    """Exactly what an unknown /api path answers (static_routes.fallback_app)."""
    return ApiError(404, "not_found", "No such API endpoint")


async def require_admin(request: Request) -> Viewer:
    """The signed-in admin, re-verified against revocation; 404 for anyone else."""
    cached = getattr(request.state, "studyhubs_admin", None)
    if isinstance(cached, Viewer):
        return cached
    runtime = get_runtime(request)
    viewer = await get_viewer(request)
    if not is_admin(runtime.settings, viewer.identity):
        raise not_found()
    cookie = request.cookies.get(session_cookie_name(runtime.settings), "")
    try:
        identity = await run_in_threadpool(runtime.auth.verify_session_strict, cookie)
    except AuthError:
        raise not_found() from None
    except AuthUnavailable:
        message = "Sign-in checks are unavailable right now"
        raise ApiError(503, "unavailable", message, retry_after=30) from None
    if not is_admin(runtime.settings, identity):
        raise not_found()
    wait = runtime.limiter.hit("uid:" + identity.uid, ADMIN_RULE)
    if wait is not None:
        raise ApiError(429, "rate_limited", "Too many admin requests, try again shortly", retry_after=wait)
    admin = Viewer(identity, viewer.public_id)
    request.state.studyhubs_admin = admin
    return admin


def require_recent_sign_in(runtime: Runtime, identity: Identity) -> None:
    auth_time = identity.auth_time
    if auth_time is None or runtime.clock.now_s() - auth_time > REAUTH_WINDOW_S:
        message = "Sign in again to do this (a sign-in within 24 hours is needed)"
        raise ApiError(403, "reauth_required", message)


def require_confirm(data: dict[str, Any], phrase: str) -> None:
    if data.get("confirm") != phrase:
        raise ApiError(422, "confirm_required", f"Type {phrase} to confirm")


def require_destructive(runtime: Runtime, identity: Identity, data: dict[str, Any], phrase: str) -> None:
    """Both rules of a destructive action: a recent sign-in, then the typed confirmation."""
    require_recent_sign_in(runtime, identity)
    require_confirm(data, phrase)
