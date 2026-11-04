"""Who is asking: the session cookie, verified (build-contracts.md section 9).

`get_viewer` never fails for a bad cookie: an invalid or expired session is treated
as anonymous and both cookies are cleared on that response (the flag is read by
`SessionCookieMiddleware`). A hint cookie without a session is cleared too, so the
bridge stops treating the visitor as signed in. Only an outage of the check itself
(Google's keys unreachable) is an error: 503 `unavailable`.
"""

from __future__ import annotations

from dataclasses import dataclass

from starlette.concurrency import run_in_threadpool
from starlette.requests import Request

from app.auth.identity import AuthError, AuthUnavailable, Identity
from app.auth.session import CLEAR_FLAG, HINT_COOKIE, public_id, session_cookie_name
from app.errors import ApiError
from app.runtime import get_runtime


@dataclass(frozen=True, slots=True)
class Viewer:
    identity: Identity | None = None
    public_id: str | None = None

    @property
    def signed_in(self) -> bool:
        return self.identity is not None

    @property
    def uid(self) -> str:
        if self.identity is None:
            raise RuntimeError("anonymous viewer has no uid")
        return self.identity.uid


ANONYMOUS = Viewer()


def flag_clear_cookies(request: Request) -> None:
    setattr(request.state, CLEAR_FLAG, True)


async def get_viewer(request: Request) -> Viewer:
    cached = getattr(request.state, "studyhubs_viewer", None)
    if isinstance(cached, Viewer):
        return cached
    runtime = get_runtime(request)
    settings = runtime.settings
    cookie = request.cookies.get(session_cookie_name(settings))
    viewer = ANONYMOUS
    if not cookie:
        if HINT_COOKIE in request.cookies:
            flag_clear_cookies(request)
    else:
        try:
            identity = await run_in_threadpool(runtime.auth.verify_session, cookie)
        except AuthError:
            flag_clear_cookies(request)
        except AuthUnavailable:
            raise ApiError(
                503, "unavailable", "Sign-in checks are unavailable right now", retry_after=30
            ) from None
        else:
            if identity.uid in runtime.deleted_uids:  # the account was deleted (DELETE /api/me)
                flag_clear_cookies(request)
            else:
                viewer = Viewer(identity, public_id(settings.secret, identity.uid))
    request.state.studyhubs_viewer = viewer
    return viewer


async def require_user(request: Request) -> Viewer:
    viewer = await get_viewer(request)
    if viewer.identity is None:
        raise ApiError(401, "unauthenticated", "Sign in to sync your progress")
    if viewer.identity.needs_verification:
        raise ApiError(403, "email_unverified", "Verify your email address to sync your progress")
    return viewer
