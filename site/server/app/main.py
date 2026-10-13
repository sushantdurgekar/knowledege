"""Application factory and the module-level ASGI app.

Run:  uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1 --proxy-headers \
          --forwarded-allow-ips=* --no-server-header

Routes are tried in order (API, hubs, static files); a request that matches no
route at all goes to `static_routes.fallback_app` (SPA shell, JSON 404 under /api).

Middleware, outermost first: security headers, app egress meter, session-cookie
clearing, site-settings refresh (M2), /api gzip. The services (store, auth, quota,
site settings, scheduler) live in one `Runtime`; the lifespan loads the quota meter
in the background, persists it every 10 minutes and once more on shutdown, and runs
the job scheduler (a boot tick of at most 3 s, then every 20 s).
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import anyio
from fastapi import FastAPI
from starlette.types import ASGIApp

from app import __version__, api_routes, hubs_routes, static_routes
from app.account import routes as account_routes
from app.admin import routes as admin_routes
from app.admin.site import SettingsRefreshMiddleware
from app.api_gzip import ApiGZipMiddleware
from app.auth import routes as auth_routes
from app.auth.identity import Authenticator
from app.auth.session import SessionCookieMiddleware
from app.clock import Clock
from app.config import Settings
from app.errors import install_error_handlers
from app.logging_setup import configure_logging
from app.progress import routes as progress_routes
from app.progress import seed
from app.quota.egress import AppEgressMiddleware
from app.quota.meter import PERSIST_INTERVAL_S
from app.runtime import Runtime, build_runtime
from app.security import SecurityHeadersMiddleware
from app.state import AppState
from app.store.base import Store

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


async def _persist_meter_forever(runtime: Runtime, interval_s: float) -> None:
    while True:
        await asyncio.sleep(interval_s)
        try:
            await anyio.to_thread.run_sync(runtime.meter.persist, abandon_on_cancel=True)
        except Exception:  # never let the loop die
            logger.exception("Quota meter persist failed")


BOOT_TICK_TIMEOUT_S = 3.0


async def _start_scheduler(runtime: Runtime) -> asyncio.Task[None] | None:
    """The boot tick (re-read jobs, finish windows that ended while down), then the loop."""
    scheduler = runtime.scheduler
    if scheduler is None:
        return None
    with anyio.move_on_after(BOOT_TICK_TIMEOUT_S):  # a slow backend must not hold startup
        await scheduler.tick_async()
    return asyncio.create_task(scheduler.run_forever())


async def _shutdown_runtime(runtime: Runtime, *tasks: asyncio.Task[None] | None) -> None:
    for task in tasks:
        if task is None:
            continue
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
    with anyio.move_on_after(10):
        try:
            await anyio.to_thread.run_sync(runtime.meter.persist, abandon_on_cancel=True)
        except Exception:
            logger.exception("Quota meter persist on shutdown failed")
    try:
        runtime.store.close()
    except Exception:
        logger.exception("Store close failed")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    state: AppState = app.state.studyhubs
    state.load()  # a missing build is logged, not fatal: /healthz must still answer
    settings = state.settings
    if settings.is_production and not settings.public_origin.startswith("https://"):
        logger.warning("PUBLIC_ORIGIN should be https in production, got %s", settings.public_origin)
    if settings.uses_dev_secret:
        logger.warning("SECRET_KEY is not set: using the development key (never in production)")
    logger.info(
        "Study Hubs %s (%s) env=%s public=%s hubs=%s auth=%s store=%s",
        __version__,
        settings.git_commit,
        settings.app_env,
        settings.public_dir,
        settings.hubs_dir,
        settings.auth_mode,
        settings.store,
    )
    runtime = state.runtime
    task: asyncio.Task[None] | None = None
    if runtime is not None and runtime.meter.persist_enabled:
        # Load in a daemon thread: a slow or unreachable backend must not delay startup.
        threading.Thread(target=runtime.meter.load, name="quota-meter-load", daemon=True).start()
        task = asyncio.create_task(_persist_meter_forever(runtime, PERSIST_INTERVAL_S))
    scheduler_task = await _start_scheduler(runtime) if runtime is not None else None
    try:
        yield
    finally:
        if runtime is not None:
            await _shutdown_runtime(runtime, scheduler_task, task)


def create_app(
    settings: Settings | None = None,
    *,
    store: Store | None = None,
    auth: Authenticator | None = None,
    clock: Clock | None = None,
) -> FastAPI:
    """Build the app. `store`, `auth` and `clock` replace the configured ones (tests)."""
    settings = settings or Settings.from_env()
    configure_logging(settings.log_level)
    runtime = build_runtime(settings, store=store, auth=auth, clock=clock)

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
    app.state.studyhubs = AppState(settings=settings, runtime=runtime)
    install_error_handlers(app)
    # add_middleware puts each new one outside the previous ones.
    app.add_middleware(ApiGZipMiddleware)
    app.add_middleware(SettingsRefreshMiddleware, cache=runtime.site)
    app.add_middleware(SessionCookieMiddleware, settings=settings)
    app.add_middleware(AppEgressMiddleware, meter=runtime.meter)

    app.include_router(api_routes.router)
    app.include_router(auth_routes.router)
    app.include_router(progress_routes.router)
    app.include_router(seed.router)
    if settings.is_test:  # never mounted outside APP_ENV=test (asserted by a unit test)
        from app.testing import routes as testing_routes

        app.include_router(testing_routes.router)
    app.include_router(account_routes.router)
    app.include_router(admin_routes.router)
    app.include_router(hubs_routes.router)
    app.include_router(static_routes.router)
    # No catch-all route: a path match with the wrong method must still get a 405.
    app.router.default = static_routes.fallback_app
    return app


app = create_app()
