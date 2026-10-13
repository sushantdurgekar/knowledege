"""The maintenance-window scheduler with an injected clock (build-contracts.md sections 19, 22):
upcoming notice, due, grace/missed, the end restores the previous mode, restart, and
exclusivity between two instances."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.admin.site import Maintenance, SiteSettingsCache
from app.clock import FixedClock
from app.config import Settings
from app.jobs.scheduler import Scheduler, tonight
from app.quota.pacific import iso_utc
from app.store.base import new_job_id
from app.store.memory import MemoryStore

START = datetime(2026, 10, 13, 18, 30, tzinfo=UTC)  # 00:00 IST on 14 Oct


class Mono:
    def __init__(self) -> None:
        self.t = 1000.0

    def __call__(self) -> float:
        return self.t


class World:
    def __init__(self, store: MemoryStore | None = None, *, force: str | None = None) -> None:
        self.store = store or MemoryStore()
        self.clock = FixedClock(int((START - timedelta(hours=1)).timestamp() * 1000))
        self.settings = Settings(app_env="test", maintenance_force=force)
        self.mono = Mono()
        self.site = SiteSettingsCache(self.store, self.settings, monotonic=self.mono)
        self.scheduler = Scheduler(self.store, self.site, self.clock, grace_min=60, monotonic=self.mono)

    def at(self, moment: datetime) -> None:
        self.clock.set(int(moment.timestamp() * 1000))

    def job(self, *, mode: str = "read_only", start: datetime = START, minutes: int = 30) -> dict[str, Any]:
        job = {
            "id": new_job_id(self.clock.now_ms()),
            "kind": "maintenance",
            "state": "scheduled",
            "mode": mode,
            "startAt": iso_utc(start),
            "endAt": iso_utc(start + timedelta(minutes=minutes)),
            "tz": "Asia/Kolkata",
            "durationMin": minutes,
            "message": "Database upgrade",
            "createdAt": "2026-10-13T17:00:00.000Z",
        }
        self.store.put_job(job)
        self.scheduler.invalidate()
        return job

    def state(self, job: dict[str, Any]) -> str:
        stored = self.store.get_job(job["id"])
        assert stored is not None
        return str(stored["state"])

    def stored_mode(self) -> str:
        return self.site.refresh().maintenance.mode


def test_upcoming_due_and_end_restores_previous_mode() -> None:
    w = World()
    w.site.set_maintenance(Maintenance("off", None, None))
    job = w.job()
    assert w.scheduler.tick() == []
    assert w.scheduler.upcoming() is None  # an hour before
    w.at(START - timedelta(minutes=10))
    w.scheduler.tick()
    assert w.scheduler.upcoming() == {
        "mode": "read_only",
        "startAt": "2026-10-13T18:30:00Z",
        "message": "Database upgrade",
    }
    w.at(START + timedelta(seconds=5))
    assert w.scheduler.tick() == [f"started {job['id']}"]
    assert w.state(job) == "running"
    assert w.scheduler.upcoming() is None
    m = w.site.maintenance()
    assert (m.mode, m.message, m.until) == ("read_only", "Database upgrade", "2026-10-13T19:00:00Z")
    stored = w.store.get_job(job["id"])
    assert stored is not None
    assert stored["prev"] == {"mode": "off", "message": None, "until": None}
    assert stored["startedAt"] == "2026-10-13T18:30:05Z"
    w.at(START + timedelta(minutes=29))
    assert w.scheduler.tick() == []
    w.at(START + timedelta(minutes=30))
    assert w.scheduler.tick() == [f"finished {job['id']}"]
    assert w.state(job) == "succeeded"
    assert w.stored_mode() == "off"
    assert w.scheduler.active() == []


def test_previous_mode_other_than_off_is_restored() -> None:
    w = World()
    w.site.set_maintenance(Maintenance("read_only", "Long migration", None))
    job = w.job(mode="full")
    w.at(START)
    w.scheduler.tick()
    assert w.stored_mode() == "full"
    w.at(START + timedelta(hours=1))
    w.scheduler.tick()
    assert w.state(job) == "succeeded"
    assert w.site.current().maintenance == Maintenance("read_only", "Long migration", None)


def test_an_admin_change_during_the_window_is_kept() -> None:
    w = World()
    w.job()
    w.at(START)
    w.scheduler.tick()
    w.site.set_maintenance(Maintenance("full", "Emergency", None))  # the admin escalates
    w.at(START + timedelta(minutes=31))
    w.scheduler.tick()
    assert w.stored_mode() == "full"


def test_grace_and_missed() -> None:
    w = World()
    late = w.job()
    w.at(START + timedelta(minutes=61))  # more than JOB_GRACE_MIN late
    w.mono.t += 400
    events = w.scheduler.tick()
    assert events == [f"missed {late['id']}"]
    stored = w.store.get_job(late["id"])
    assert stored is not None
    assert stored["state"] == "missed"
    assert "61 min late" in stored["error"]
    assert w.stored_mode() == "off"  # a missed job never runs


def test_within_grace_still_runs() -> None:
    w = World()
    job = w.job(minutes=120)
    w.at(START + timedelta(minutes=59))
    assert w.scheduler.tick() == [f"started {job['id']}"]
    assert w.stored_mode() == "read_only"


def test_window_over_before_the_server_saw_it_is_missed() -> None:
    w = World()
    job = w.job(minutes=10)
    w.at(START + timedelta(minutes=20))  # within grace, but the window already ended
    assert w.scheduler.tick() == [f"missed {job['id']}"]
    assert w.stored_mode() == "off"


def test_restart_finishes_a_window_that_ended_while_down() -> None:
    w = World()
    job = w.job()
    w.at(START)
    w.scheduler.tick()
    assert w.stored_mode() == "read_only"
    # The process dies; a new one boots after the window's end with an empty cache.
    w2 = World(w.store)
    w2.at(START + timedelta(hours=2))
    assert w2.scheduler.tick() == [f"finished {job['id']}"]
    assert w2.stored_mode() == "off"


def test_restart_during_the_window_keeps_it_running() -> None:
    w = World()
    job = w.job()
    w.at(START)
    w.scheduler.tick()
    w2 = World(w.store)
    w2.at(START + timedelta(minutes=10))
    assert w2.scheduler.tick() == []
    assert w2.stored_mode() == "read_only"
    w2.at(START + timedelta(minutes=30))
    assert w2.scheduler.tick() == [f"finished {job['id']}"]


def test_two_instances_apply_a_job_once() -> None:
    w = World()
    job = w.job()
    other = Scheduler(w.store, w.site, w.clock, grace_min=60, monotonic=w.mono)
    w.at(START)
    events = w.scheduler.tick() + other.tick()
    assert events == [f"started {job['id']}"]


def test_cache_is_refreshed_every_five_minutes_only() -> None:
    w = World()
    w.scheduler.tick()
    reads = w.store.ops.snapshot().reads
    for _ in range(10):
        w.scheduler.tick()
    assert w.store.ops.snapshot().reads == reads  # nothing due: no store read
    w.mono.t += 301
    w.scheduler.tick()
    assert w.store.ops.snapshot().reads == reads + 1  # the 5-minute re-read


def test_forced_mode_wins_but_the_stored_mode_still_changes() -> None:
    w = World(force="full")
    w.job()
    w.at(START)
    w.scheduler.tick()
    assert w.site.maintenance().mode == "full"
    assert w.site.current().maintenance.mode == "read_only"


def test_invalid_job_fails() -> None:
    w = World()
    job = {**w.job(), "durationMin": "x"}
    w.store.put_job(job)
    w.scheduler.invalidate()
    assert w.scheduler.tick() == [f"failed {job['id']}"]
    assert w.state(job) == "failed"


@pytest.mark.parametrize(
    ("tz", "now", "expected"),
    [
        (
            "Asia/Kolkata",
            datetime(2026, 10, 13, 10, 0, tzinfo=UTC),
            datetime(2026, 10, 13, 18, 30, tzinfo=UTC),
        ),
        (
            "Asia/Kolkata",
            datetime(2026, 10, 13, 19, 0, tzinfo=UTC),
            datetime(2026, 10, 14, 18, 30, tzinfo=UTC),
        ),
        (
            "America/Los_Angeles",
            datetime(2026, 11, 1, 12, 0, tzinfo=UTC),
            datetime(2026, 11, 2, 8, 0, tzinfo=UTC),
        ),
    ],
)
def test_tonight(tz: str, now: datetime, expected: datetime) -> None:
    assert tonight(tz, now) == expected


def test_site_settings_cache_refreshes_at_most_every_60_s() -> None:
    w = World()
    w.site.refresh()
    reads = w.store.ops.snapshot().reads
    w.site.refresh_if_stale()
    assert w.store.ops.snapshot().reads == reads
    # Another instance writes the setting: this one sees it within 60 s.
    other = SiteSettingsCache(w.store, w.settings, monotonic=w.mono)
    other.set_maintenance(Maintenance("read_only", None, None))
    reads = w.store.ops.snapshot().reads
    w.mono.t += 30
    w.site.refresh_if_stale()
    assert w.site.maintenance().mode == "off"
    w.mono.t += 31
    w.site.refresh_if_stale()
    assert w.site.maintenance().mode == "read_only"
    assert w.store.ops.snapshot().reads == reads + 1
    # Its own write is visible at once, without a read.
    w.site.update(lambda s: replace(s, notice="Hi"))
    assert w.site.current().notice == "Hi"
