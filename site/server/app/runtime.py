"""The services one process shares: clock, store, auth, quota meter and guard, rate
limits and the test-only fault queue (M1); site settings with the maintenance mode,
the job scheduler and backup tickets (M2).

`create_app` builds one `Runtime` per app (tests can inject a store, an
authenticator or a clock) and routes reach it through `get_runtime(request)`.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from functools import cached_property
from typing import Any

from starlette.requests import Request

from app.admin.backups import Backups
from app.admin.site import SiteSettingsCache
from app.auth.fake import FakeAuthenticator
from app.auth.identity import Authenticator
from app.auth.ratelimit import RateLimiter
from app.clock import Clock
from app.config import Settings
from app.jobs.scheduler import Scheduler
from app.progress.service import ProgressService
from app.quota.guard import Guard
from app.quota.meter import Meter
from app.restore.runner import RestoreService
from app.restore.uploads import Uploads
from app.store.base import Store
from app.store.factory import make_store


@dataclass(frozen=True, slots=True)
class Fault:
    op: str  # "get" | "put" | "any"
    status: int
    code: str
    retry_after: int | None


class Faults:
    """Injected failures for the next N progress/sync calls (`POST /api/test/faults`)."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._queue: list[list[Any]] = []  # [Fault, remaining]

    def add(self, fault: Fault, count: int = 1) -> None:
        with self._lock:
            self._queue.append([fault, count])

    def take(self, op: str) -> Fault | None:
        with self._lock:
            for entry in self._queue:
                fault, remaining = entry
                if remaining > 0 and fault.op in (op, "any"):
                    entry[1] -= 1
                    self._queue = [e for e in self._queue if e[1] > 0]
                    return fault
        return None

    def clear(self) -> None:
        with self._lock:
            self._queue.clear()

    def __len__(self) -> int:
        with self._lock:
            return sum(entry[1] for entry in self._queue)


def make_authenticator(settings: Settings, clock: Clock) -> Authenticator:
    if settings.auth_mode == "fake":
        return FakeAuthenticator(settings.secret, clock, session_days=settings.session_days)
    from app.auth.firebase import FirebaseAuthenticator

    return FirebaseAuthenticator(settings, clock)


@dataclass
class Runtime:
    settings: Settings
    clock: Clock
    store: Store
    auth: Authenticator
    meter: Meter
    guard: Guard
    site: SiteSettingsCache
    limiter: RateLimiter = field(default_factory=RateLimiter)
    faults: Faults = field(default_factory=Faults)
    # uids whose account was deleted by this process: their sessions count as signed out.
    deleted_uids: set[str] = field(default_factory=set)
    # Set by create_app (M2): the maintenance-window scheduler and the backup tickets.
    scheduler: Any = None
    backups: Any = None
    restore: Any = None  # M3: RestoreService (uploads, validation, restore jobs)

    @cached_property
    def progress(self) -> ProgressService:
        return ProgressService(self.store, self.guard)

    @property
    def maintenance_mode(self) -> str:
        """The effective mode: MAINTENANCE_FORCE, else the stored setting (at most 60 s old)."""
        return self.site.mode()

    def maintenance(self) -> dict[str, Any]:
        return self.site.maintenance().to_json()

    def upcoming(self) -> dict[str, Any] | None:
        """The maintenance window starting within 10 minutes, for /api/me and progress."""
        return self.scheduler.upcoming() if self.scheduler is not None else None


def build_runtime(
    settings: Settings,
    *,
    store: Store | None = None,
    auth: Authenticator | None = None,
    clock: Clock | None = None,
) -> Runtime:
    clock = clock or Clock()
    store = store or make_store(settings, clock)
    meter = Meter(store, clock, tz=settings.quota_tz, persist_enabled=store.kind != "memory")
    site = SiteSettingsCache(store, settings)
    runtime = Runtime(
        settings=settings,
        clock=clock,
        store=store,
        auth=auth or make_authenticator(settings, clock),
        meter=meter,
        guard=Guard(settings, meter, clock),
        site=site,
    )
    runtime.scheduler = Scheduler(store, site, clock, grace_min=settings.job_grace_min, quiet=meter.quiet)
    runtime.backups = Backups(clock)
    uploads = Uploads(settings.data_dir, max_bytes=settings.max_backup_bytes)
    uploads.recover()
    runtime.restore = RestoreService(
        store,
        site,
        settings,
        clock,
        uploads,
        holder=runtime.scheduler.holder,
        writes_today=lambda: meter.today()["writes"],
        reads_today=lambda: meter.today()["reads"],
        batch_delay_s=settings.restore_batch_delay_ms / 1000,
    )
    runtime.scheduler.restores = runtime.restore
    return runtime


def get_runtime(request: Request) -> Runtime:
    runtime: Runtime = request.app.state.studyhubs.runtime
    return runtime
