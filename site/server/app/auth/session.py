"""Session and hint cookies, and the publicId (build-contracts.md section 9).

- Session cookie: `__Host-sh_session` when PUBLIC_ORIGIN is https, `sh_session` on
  http (local/test). `HttpOnly; SameSite=Lax; Path=/; Max-Age=SESSION_DAYS*86400`,
  plus `Secure` only on https.
- Hint cookie `sh_hint` = publicId, readable by JS, same Secure/SameSite/Path/Max-Age.
  It only tells the bridge that someone is probably signed in; the server never
  trusts it.
- publicId = first 22 characters of base64url(HMAC-SHA256(SECRET_KEY, "publicId:" + uid)).
  The raw uid never reaches hub JavaScript.

`SessionCookieMiddleware` clears both cookies on any response to a request whose
session cookie turned out to be invalid (the dependency in `deps.py` flags it).
"""

from __future__ import annotations

import base64
import hashlib
import hmac

from starlette.datastructures import MutableHeaders
from starlette.responses import Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config import Settings

SECURE_SESSION_COOKIE = "__Host-sh_session"
PLAIN_SESSION_COOKIE = "sh_session"
HINT_COOKIE = "sh_hint"
PUBLIC_ID_LENGTH = 22
CLEAR_FLAG = "studyhubs_clear_session"


def session_cookie_name(settings: Settings) -> str:
    return SECURE_SESSION_COOKIE if settings.https else PLAIN_SESSION_COOKIE


def public_id(secret: bytes, uid: str) -> str:
    digest = hmac.new(secret, b"publicId:" + uid.encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")[:PUBLIC_ID_LENGTH]


def _cookie(name: str, value: str, *, max_age: int, http_only: bool, secure: bool) -> str:
    parts = [f"{name}={value}", f"Max-Age={max_age}", "Path=/"]
    if http_only:
        parts.append("HttpOnly")
    parts.append("SameSite=Lax")
    if secure:
        parts.append("Secure")
    return "; ".join(parts)


def session_cookie_headers(settings: Settings, session: str, hint: str) -> list[str]:
    max_age = settings.session_days * 86400
    secure = settings.https
    return [
        _cookie(session_cookie_name(settings), session, max_age=max_age, http_only=True, secure=secure),
        _cookie(HINT_COOKIE, hint, max_age=max_age, http_only=False, secure=secure),
    ]


def clear_cookie_headers(settings: Settings) -> list[str]:
    secure = settings.https
    return [
        _cookie(session_cookie_name(settings), "", max_age=0, http_only=True, secure=secure),
        _cookie(HINT_COOKIE, "", max_age=0, http_only=False, secure=secure),
    ]


def set_session_cookies(response: Response, settings: Settings, session: str, hint: str) -> None:
    for header in session_cookie_headers(settings, session, hint):
        response.headers.append("set-cookie", header)


def clear_session_cookies(response: Response, settings: Settings) -> None:
    for header in clear_cookie_headers(settings):
        response.headers.append("set-cookie", header)


class SessionCookieMiddleware:
    """Append the cookie-clearing headers when a dependency flagged a bad session.

    Routes that set or clear the cookies themselves (sign-in, logout) win: nothing is
    added when the response already sets the session cookie.
    """

    def __init__(self, app: ASGIApp, *, settings: Settings) -> None:
        self.app = app
        self._name = session_cookie_name(settings).lower().encode()
        self._clear = [(b"set-cookie", h.encode("latin-1")) for h in clear_cookie_headers(settings)]

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        state = scope.setdefault("state", {})

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start" and state.get(CLEAR_FLAG):
                headers = MutableHeaders(scope=message)
                existing = [v.lower().encode("latin-1") for v in headers.getlist("set-cookie")]
                if not any(v.startswith(self._name + b"=") for v in existing):
                    message.setdefault("headers", [])
                    message["headers"] = [*message["headers"], *self._clear]
            await send(message)

        await self.app(scope, receive, send_wrapper)
