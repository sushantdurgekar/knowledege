"""Application factory and the module-level ASGI app.

Run:  uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1 --proxy-headers \
          --forwarded-allow-ips=* --no-server-header

Routes are tried in order (API, hubs, static files); a request that matches no
route at all goes to `static_routes.fallback_app` (SPA shell, JSON 404 under /api).
M1+ routers go where marked.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from starlette.types import ASGIApp

from app import __version__, api_routes, hubs_routes, static_routes
from app.api_gzip import ApiGZipMiddleware
from app.config import Settings
from app.errors import install_error_handlers
from app.logging_setup import configure_logging
from app.progress import seed
from app.security import SecurityHeadersMiddleware
from app.state import AppState

logger = logging.getLogger(__name__)


class StudyHubsApp(FastAPI):
    """FastAPI whose outermost layer is the security-header middleware.

    `add_middleware` would place it inside ServerErrorMiddleware, so responses for
    unhandled exceptions would miss the global headers. Wrapping the built stack
    covers every response the app can send.
    """

    def __init__(self, *, hsts: bool, **kwargs: Any) -> None:
        self._hsts = hsts
        super().__init__(**kwargs)

    def build_middleware_stack(self) -> ASGIApp:
        return SecurityHeadersMiddleware(super().build_middleware_stack(), hsts=self._hsts)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    state: AppState = app.state.studyhubs
    state.load()  # a missing build is logged, not fatal: /healthz must still answer
    if state.settings.is_production and not state.settings.public_origin.startswith("https://"):
        logger.warning("PUBLIC_ORIGIN should be https in production, got %s", state.settings.public_origin)
    logger.info(
        "Study Hubs %s (%s) env=%s public=%s hubs=%s",
        __version__,
        state.settings.git_commit,
        state.settings.app_env,
        state.settings.public_dir,
        state.settings.hubs_dir,
    )
    yield


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    configure_logging(settings.log_level)

    app = StudyHubsApp(
        hsts=settings.is_production,
        title="Study Hubs",
        version=__version__,
        lifespan=lifespan,
        # No Swagger/ReDoc/OpenAPI routes: /docs etc. belong to the SPA fallback.
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        # Trailing slashes are handled explicitly (301 for hubs and SPA routes).
        redirect_slashes=False,
    )
    app.state.studyhubs = AppState(settings=settings)
    install_error_handlers(app)
    app.add_middleware(ApiGZipMiddleware)

    app.include_router(api_routes.router)
    app.include_router(seed.router)
    # M1+: auth, progress, account and admin routers are included here.
    app.include_router(hubs_routes.router)
    app.include_router(static_routes.router)
    # No catch-all route: a path match with the wrong method must still get a 405.
    app.router.default = static_routes.fallback_app
    return app


app = create_app()
