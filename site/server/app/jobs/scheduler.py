"""Maintenance windows on a schedule (build-contracts.md section 19; restore jobs are M3).

- An asyncio task ticks every 20 s. Jobs are cached and re-read every 5 minutes (at
  most 288 reads a day, plus one per active job) and right after an admin edit.
- At T-10 min, `/api/me` and progress responses carry `upcoming {mode, startAt, message}`.
- A job more than JOB_GRACE_MIN late (or whose window already ended) becomes `missed`
  and does not run; the admin page shows a banner for it.
- At `startAt` a job sets the maintenance mode (remembering the previous one in the
  job) and at `startAt + durationMin` restores it, unless an admin changed the mode in
  between (then the admin's choice stands).
- Every state change is an atomic `claim_job` transition, so with several instances
  (or a restart racing a tick) exactly one of them applies it.
- A store failure never strands a window: the instance that claimed a job retries the
  mode change (and the job's record of the previous mode) on its next ticks, and a
  window's end restores the previous mode *before* the job is marked `succeeded`, so a
  failed restore is simply tried again (by any instance, also after a restart). A job
  cancelled while its mode was being set keeps `cancelled` and the change is undone.
- Survives restarts: the first tick after boot re-reads the jobs, and a `running`
  job whose end has passed is finished then.

States: scheduled -> running -> succeeded | failed | cancelled | missed.
"""

from __future__ import annotations

import asyncio
import logging
import os
import secrets
import socket
import threading
import time
from collections.abc import Callable
from contextlib import AbstractContextManager, nullcontext
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import Any

import anyio

from app.admin.site import Maintenance, SiteSettings, SiteSettingsCache
from app.clock import Clock
from app.quota.pacific import iso_utc
from app.store.base import ACTIVE_JOB_STATES, Store, StoreError

logger = logging.getLogger(__name__)

TICK_S = 20.0
REFRESH_S = 300.0
NOTICE_BEFORE = timedelta(minutes=10)
MAX_ACTIVE = 100


def parse_iso(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return moment if moment.tzinfo is not None else None


def window(job: dict[str, Any]) -> tuple[datetime, datetime] | None:
    start = parse_iso(job.get("startAt"))
    minutes = job.get("durationMin")
    if start is None or not isinstance(minutes, int):
        return None
    return start, start + timedelta(minutes=minutes)


class Scheduler:
    def __init__(
        self,
        store: Store,
        site: SiteSettingsCache,
        clock: Clock,
        *,
        grace_min: int,
        monotonic: Callable[[], float] = time.monotonic,
        quiet: Callable[[], AbstractContextManager[None]] = nullcontext,
    ) -> None:
        self._store = store
        self._site = site
        self._clock = clock
        self._grace = timedelta(minutes=grace_min)
        self._now_mono = monotonic
        self._quiet = quiet  # the meter's quiet(): timer reads never trigger a usage write alone
        self._lock = threading.Lock()  # the cache
        self._tick_lock = threading.Lock()  # one tick at a time
        self._jobs: list[dict[str, Any]] = []
        self._next_read = float("-inf")
        # job id -> the mode a start replaced, until the job records it (survives a failed write)
        self._replaced: dict[str, Maintenance] = {}
        self.holder = f"{socket.gethostname()}-{os.getpid()}-{secrets.token_hex(3)}"
        self.last_tick: datetime | None = None
        self.last_error: str | None = None

    # -- cache ----------------------------------------------------------------------------

    def refresh(self) -> list[dict[str, Any]]:
        jobs = self._store.list_jobs(set(ACTIVE_JOB_STATES), limit=MAX_ACTIVE)
        with self._lock:
            self._jobs = jobs
            self._next_read = self._now_mono() + REFRESH_S
        return jobs

    def invalidate(self) -> None:
        with self._lock:
            self._next_read = float("-inf")

    def reset(self) -> None:
        with self._lock:
            self._jobs = []
            self._next_read = float("-inf")
            self._replaced.clear()
            self.last_error = None

    def active(self) -> list[dict[str, Any]]:
        """Cached scheduled and running jobs, soonest first (no store read)."""
        with self._lock:
            jobs = list(self._jobs)
        return sorted(jobs, key=lambda j: (str(j.get("startAt")), str(j.get("id"))))

    def upcoming(self) -> dict[str, Any] | None:
        """The soonest scheduled window starting within 10 minutes (no store read)."""
        now = self._clock.now()
        for job in self.active():
            span = window(job)
            if job.get("state") != "scheduled" or span is None:
                continue
            if span[0] - NOTICE_BEFORE <= now < span[0]:
                return {"mode": job.get("mode"), "startAt": job.get("startAt"), "message": job.get("message")}
        return None

    # -- one tick -------------------------------------------------------------------------------

    def tick(self) -> list[str]:
        """Apply what is due; returns what happened (for logs and tests). Thread-blocking."""
        with self._tick_lock, self._quiet():
            if self._now_mono() >= self._next_read:
                self.refresh()
            now = self._clock.now()
            self.last_tick = now
            events: list[str] = []
            changed = False
            for job in self.active():
                try:
                    event = self._step(job, now)
                except StoreError as exc:
                    self.last_error = str(exc)
                    logger.warning("Scheduler: job %s not advanced (retry next tick): %s", job.get("id"), exc)
                    changed = True  # re-read the jobs: a claim may have gone through
                    continue
                if event:
                    events.append(event)
                    changed = True
            if changed:
                try:
                    self.refresh()
                except StoreError as exc:
                    self.last_error = str(exc)
                    self.invalidate()  # the next tick tries again
            return events

    def _step(self, job: dict[str, Any], now: datetime) -> str | None:
        span = window(job)
        job_id = str(job.get("id"))
        if span is None:
            if self._store.claim_job(job_id, self.holder, {"scheduled", "running"}, to_state="failed"):
                self._finish(job_id, now, error="invalid startAt or durationMin")
                return f"failed {job_id}"
            return None
        start, end = span
        state = job.get("state")
        if state == "scheduled":
            if now < start:
                return None
            if now - start > self._grace or now >= end:
                if self._store.claim_job(job_id, self.holder, {"scheduled"}, to_state="missed"):
                    late = int((now - start).total_seconds() // 60)
                    self._finish(job_id, now, error=f"missed: the server was {late} min late")
                    logger.warning("Scheduler: maintenance job %s missed (%d min late)", job_id, late)
                    return f"missed {job_id}"
                return None
            if not self._store.claim_job(job_id, self.holder, {"scheduled"}):
                return None
            return self._start(job, now, end)
        if state == "running" and now >= end:
            return self._end(job_id, now)
        if state == "running" and job.get("holder") == self.holder and not job.get("startedAt"):
            return self._start(job, now, end)  # our claim went through, the rest failed: retry
        return None

    def _start(self, job: dict[str, Any], now: datetime, end: datetime) -> str | None:
        """Set the job's mode once, then record the mode it replaced in the job."""
        job_id = str(job.get("id"))
        previous = self._replaced.get(job_id)
        if previous is None:
            previous = self._apply(job, end)
            self._replaced[job_id] = previous
        stored = self._store.get_job(job_id)
        if stored is None or stored.get("state") != "running":
            # Cancelled while the mode was being set: keep the cancel and undo the change.
            self._undo(job, previous)
            self._replaced.pop(job_id, None)
            return None
        stored.update(prev=previous.stored_json(), startedAt=iso_utc(now))
        self._store.put_job(stored)
        self._replaced.pop(job_id, None)
        logger.info("Scheduler: maintenance %s started (job %s, until %s)", job.get("mode"), job_id, end)
        return f"started {job_id}"

    def _end(self, job_id: str, now: datetime) -> str | None:
        """Restore the previous mode first, then mark the job done: a failed restore is retried."""
        stored = self._store.get_job(job_id)
        if stored is None or stored.get("state") != "running":
            return None  # another instance (or an admin) ended it
        self.restore(stored)
        if not self._store.claim_job(job_id, self.holder, {"running"}, to_state="succeeded"):
            return None
        self._finish(job_id, now)
        logger.info("Scheduler: maintenance job %s finished, previous mode restored", job_id)
        return f"finished {job_id}"

    def _apply(self, job: dict[str, Any], end: datetime) -> Maintenance:
        """Set the job's mode; return the mode it replaces."""
        previous: list[Maintenance] = []

        def change(current: SiteSettings) -> SiteSettings:
            previous.append(current.maintenance)
            message = job.get("message") if isinstance(job.get("message"), str) else None
            return replace(
                current, maintenance=Maintenance(str(job.get("mode")), message or None, iso_utc(end))
            )

        self._site.update(change)
        return previous[-1]

    def restore(self, job: dict[str, Any]) -> None:
        """Put back the mode the job replaced, unless an admin has changed it since.

        Safe to repeat: once the job's mode is gone, nothing is written.
        """
        stored = job if "prev" in job else (self._store.get_job(str(job.get("id"))) or job)
        prev = self._replaced.get(str(job.get("id"))) or Maintenance.from_json(stored.get("prev"))
        self._undo(stored, prev)

    def _undo(self, job: dict[str, Any], prev: Maintenance) -> None:
        def change(current: SiteSettings) -> SiteSettings:
            if current.maintenance.mode != job.get("mode"):
                return current  # someone chose another mode meanwhile: keep it
            return replace(current, maintenance=prev)

        self._site.update(change)

    def _finish(self, job_id: str, now: datetime, *, error: str | None = None) -> None:
        stored = self._store.get_job(job_id)
        if stored is None:
            return
        stored["finishedAt"] = iso_utc(now)
        if error:
            stored["error"] = error
        self._store.put_job(stored)

    # -- the loop ---------------------------------------------------------------------------------

    async def tick_async(self) -> None:
        try:
            await anyio.to_thread.run_sync(self.tick, abandon_on_cancel=True)
        except Exception as exc:  # never let the loop die
            self.last_error = str(exc)
            logger.exception("Scheduler tick failed")

    async def run_forever(self, interval_s: float = TICK_S) -> None:
        """Tick every `interval_s` (the lifespan runs the boot tick before this starts)."""
        while True:
            await asyncio.sleep(interval_s)
            await self.tick_async()


def tonight(tz_name: str, now: datetime) -> datetime:
    """00:00 tonight in `tz_name` (the next local midnight after `now`), in UTC."""
    from app.quota.pacific import next_reset

    return next_reset(now, tz_name).astimezone(UTC)
