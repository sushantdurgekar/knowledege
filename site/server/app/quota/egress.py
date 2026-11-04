"""App egress meter: response body bytes as sent (after /api gzip), per Pacific day.

The quota meter reports it as `appEgress`; the Render egress guard (M2) reads it.

`/healthz` is not counted: an uptime monitor pings it every few minutes to keep the free
instance awake, and counting those few bytes would make every 10-minute meter persist
write to the store (144 writes a day) on a site nobody is using.
"""

from __future__ import annotations

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.quota.meter import Meter

HEALTH_PATH = "/healthz"


class AppEgressMiddleware:
    def __init__(self, app: ASGIApp, *, meter: Meter) -> None:
        self.app = app
        self._meter = meter

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("path") == HEALTH_PATH:
            await self.app(scope, receive, send)
            return
        sent = 0

        async def counting_send(message: Message) -> None:
            nonlocal sent
            if message["type"] == "http.response.body":
                sent += len(message.get("body", b""))
            await send(message)

        try:
            await self.app(scope, receive, counting_send)
        finally:
            self._meter.add_app_egress(sent)
