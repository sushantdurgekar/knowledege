"""Site settings: maintenance mode, admin time zone and notice (`meta/settings`).

build-contracts.md section 19:
- `{maintenance: {mode, message, until}, tz, notice}` lives in one document with an
  optimistic `version`, so one read refreshes everything.
- `MAINTENANCE_FORCE` (env) overrides the stored mode: the break-glass switch.
- Every instance re-reads the document at most every 60 s (lazily: only when an API
  request needs it, so an idle server reads nothing) and at once after its own write.
- A failed read keeps the last known value and retries after 15 s; before the first
  successful read the stored mode counts as "off".

Synchronous methods block on the store (call them from a worker thread); the
async `ensure_fresh` is what request handling awaits.
"""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field, replace
from typing import Any

from starlette.concurrency import run_in_threadpool
from starlette.types import ASGIApp, Receive, Scope, Send

from app.config import Settings
from app.store.base import Conflict, Store, StoreError

logger = logging.getLogger(__name__)

SETTINGS_KEY = "settings"
REFRESH_S = 60.0
ERROR_RETRY_S = 15.0
MODES = ("off", "read_only", "full")
MAX_MESSAGE = 500
MAX_NOTICE = 1000
DEFAULT_MESSAGES = {
    "read_only": "Sync is paused for maintenance. Your progress is saved in this browser.",
    "full": "Study Hubs is under maintenance. Your progress is saved in this browser.",
}


@dataclass(frozen=True, slots=True)
class Maintenance:
    mode: str = "off"
    message: str | None = None
    until: str | None = None  # ISO, informational

    def to_json(self) -> dict[str, Any]:
        message = self.message or DEFAULT_MESSAGES.get(self.mode)
        return {"mode": self.mode, "message": message, "until": self.until}

    def stored_json(self) -> dict[str, Any]:
        return {"mode": self.mode, "message": self.message, "until": self.until}

    @classmethod
    def from_json(cls, data: Any) -> Maintenance:
        if not isinstance(data, dict):
            return cls()
        mode = data.get("mode") if data.get("mode") in MODES else "off"
        message = data.get("message") if isinstance(data.get("message"), str) else None
        until = data.get("until") if isinstance(data.get("until"), str) else None
        return cls(mode, message or None, until)


@dataclass(frozen=True, slots=True)
class SiteSettings:
    maintenance: Maintenance = field(default_factory=Maintenance)
    tz: str = "Asia/Kolkata"
    notice: str | None = None
    version: int = 0  # 0: never written

    def to_doc(self) -> dict[str, Any]:
        return {"maintenance": self.maintenance.stored_json(), "tz": self.tz, "notice": self.notice}

    @classmethod
    def from_doc(cls, data: dict[str, Any], version: int, default_tz: str) -> SiteSettings:
        tz = data.get("tz") if isinstance(data.get("tz"), str) and data.get("tz") else default_tz
        notice = data.get("notice") if isinstance(data.get("notice"), str) else None
        return cls(Maintenance.from_json(data.get("maintenance")), str(tz), notice or None, version)


class SiteSettingsCache:
    def __init__(
        self, store: Store, settings: Settings, *, monotonic: Callable[[], float] = time.monotonic
    ) -> None:
        self._store = store
        self._settings = settings
        self._now = monotonic
        self._lock = threading.Lock()
        self._write_lock = threading.Lock()
        self._value = SiteSettings(tz=settings.admin_tz)
        self._loaded = False
        self._next_read = float("-inf")
        self._generation = 0  # bumped by every write, so an older read never overwrites it

    # -- reading -----------------------------------------------------------------------

    @property
    def loaded(self) -> bool:
        return self._loaded

    def stale(self) -> bool:
        return self._now() >= self._next_read

    def current(self) -> SiteSettings:
        with self._lock:
            return self._value

    def refresh(self) -> SiteSettings:
        """Read `meta/settings` now (1 read). On failure keep the last value, retry in 15 s."""
        with self._lock:
            generation = self._generation
        try:
            found = self._store.get_setting(SETTINGS_KEY)
        except StoreError as exc:
            logger.warning("Site settings: read failed, keeping the last value: %s", exc)
            with self._lock:
                self._next_read = self._now() + ERROR_RETRY_S
                return self._value
        value = (
            SiteSettings.from_doc(found[0], found[1], self._settings.admin_tz)
            if found is not None
            else SiteSettings(tz=self._settings.admin_tz)
        )
        with self._lock:
            if generation == self._generation:  # no write of ours raced this read
                self._value = value
            self._loaded = True
            self._next_read = self._now() + REFRESH_S
            return self._value

    def refresh_if_stale(self) -> None:
        if self.stale():
            self.refresh()

    async def ensure_fresh(self) -> None:
        if self.stale():
            await run_in_threadpool(self.refresh_if_stale)

    def _set(self, value: SiteSettings) -> None:
        with self._lock:
            self._generation += 1
            self._value = value
            self._loaded = True
            self._next_read = self._now() + REFRESH_S

    def invalidate(self) -> None:
        with self._lock:
            self._next_read = float("-inf")

    def reset(self) -> None:
        """Forget everything (test route `POST /api/test/reset`): the next request re-reads."""
        with self._lock:
            self._generation += 1
            self._value = SiteSettings(tz=self._settings.admin_tz)
            self._loaded = False
            self._next_read = float("-inf")

    # -- effective maintenance --------------------------------------------------------------

    @property
    def forced(self) -> str | None:
        return self._settings.maintenance_force

    def maintenance(self) -> Maintenance:
        force = self._settings.maintenance_force
        if force:
            return Maintenance(force)
        return self.current().maintenance

    def mode(self) -> str:
        return self.maintenance().mode

    # -- writing (optimistic) ------------------------------------------------------------------

    def update(
        self, change: Callable[[SiteSettings], SiteSettings], *, expect_version: int | None = None
    ) -> SiteSettings:
        """Read-modify-write `meta/settings`. `expect_version` (when given) must match the
        stored version, else `Conflict`; the cache holds the result at once."""
        with self._write_lock:
            found = self._store.get_setting(SETTINGS_KEY)
            current = (
                SiteSettings.from_doc(found[0], found[1], self._settings.admin_tz)
                if found is not None
                else SiteSettings(tz=self._settings.admin_tz)
            )
            if expect_version is not None and expect_version != current.version:
                self._set(current)
                raise Conflict(f"settings version is {current.version}, expected {expect_version}")
            changed = change(current)
            version = self._store.put_setting(SETTINGS_KEY, changed.to_doc(), expect_version=current.version)
            value = replace(changed, version=version)
            self._set(value)
            return value

    def set_maintenance(self, maintenance: Maintenance, *, expect_version: int | None = None) -> SiteSettings:
        return self.update(lambda s: replace(s, maintenance=maintenance), expect_version=expect_version)


class SettingsRefreshMiddleware:
    """Before an /api request runs, make sure the site settings are at most 60 s old.

    Only API requests pay (anonymous hub and catalog loads never touch the store), and
    the test-only routes and /api/config are skipped.
    """

    SKIP = ("/api/test/", "/api/config")

    def __init__(self, app: ASGIApp, *, cache: SiteSettingsCache) -> None:
        self.app = app
        self._cache = cache

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path = scope.get("path", "") if scope["type"] == "http" else ""
        if path.startswith("/api/") and not path.startswith(self.SKIP) and self._cache.stale():
            try:
                await self._cache.ensure_fresh()
            except Exception:  # never fail a request for this
                logger.exception("Site settings refresh failed")
        await self.app(scope, receive, send)
