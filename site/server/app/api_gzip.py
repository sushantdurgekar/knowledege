"""On-the-fly gzip for dynamic /api responses only.

Hubs, the shell, /_sh and the catalog are compressed at build time and served with
their own Content-Encoding; they must never be compressed again, so this middleware
does not even look at them. Inside /api, Starlette's GZipMiddleware already skips
responses that set Content-Encoding, 206s and the excluded media types below
(M2's streamed .backup download is application/octet-stream and already gzipped).
"""

from __future__ import annotations

from starlette.middleware.gzip import DEFAULT_EXCLUDED_CONTENT_TYPES, GZipMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send

from app.paths import is_api_path

API_GZIP_MINIMUM_SIZE = 1000
API_GZIP_LEVEL = 5


class ApiGZipMiddleware:
    def __init__(
        self,
        app: ASGIApp,
        *,
        minimum_size: int = API_GZIP_MINIMUM_SIZE,
        compresslevel: int = API_GZIP_LEVEL,
    ) -> None:
        self.app = app
        self.gzip = GZipMiddleware(
            app,
            minimum_size=minimum_size,
            compresslevel=compresslevel,
            exclude_content_types=(*DEFAULT_EXCLUDED_CONTENT_TYPES, "application/octet-stream"),
        )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and is_api_path(scope.get("path", "")):
            await self.gzip(scope, receive, send)
        else:
            await self.app(scope, receive, send)
