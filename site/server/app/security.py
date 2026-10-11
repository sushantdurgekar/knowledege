"""Global response headers (build-contracts.md section 5, "Every response").

A pure ASGI middleware, wrapped outside Starlette's ServerErrorMiddleware by
`create_app`, so even an unhandled-error 500 carries these headers. Headers a
route set itself win; the middleware only fills in what is missing.
"""

from __future__ import annotations

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.paths import is_api_path, is_hub_path

HUB_COOP = b"same-origin"
# The shell keeps popups working for Firebase's signInWithPopup (M1).
SHELL_COOP = b"same-origin-allow-popups"
HSTS = b"max-age=31536000"

_BASE_HEADERS: tuple[tuple[bytes, bytes], ...] = (
    (b"x-content-type-options", b"nosniff"),
    (b"referrer-policy", b"strict-origin-when-cross-origin"),
    (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
)


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp, *, hsts: bool) -> None:
        self.app = app
        base = list(_BASE_HEADERS)
        if hsts:  # production only: never pin HSTS on localhost
            base.append((b"strict-transport-security", HSTS))
        self._base = tuple(base)

    def _defaults_for(self, path: str) -> tuple[tuple[bytes, bytes], ...]:
        coop = HUB_COOP if is_hub_path(path) else SHELL_COOP
        defaults = (*self._base, (b"cross-origin-opener-policy", coop))
        if is_api_path(path) or path == "/healthz":
            # API answers are per-user (M1+): never let a shared cache keep one.
            defaults = (*defaults, (b"cache-control", b"no-store"))
        return defaults

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        defaults = self._defaults_for(scope.get("path", ""))

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", ()))
                present = {name.lower() for name, _ in headers}
                headers.extend(item for item in defaults if item[0] not in present)
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_with_headers)
