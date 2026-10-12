"""Pacific days (DST 2026-11-01), the meter, tiers, budget pause, breaker and per-user cap."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.clock import FixedClock
from app.config import Settings, parse_sync_tiers
from app.quota import pacific
from app.quota.guard import PROBE_INTERVAL, Guard
from app.quota.meter import Meter
from app.store.base import Unavailable
from app.store.memory import MemoryStore


def utc(*args: int) -> datetime:
    return datetime(*args, tzinfo=UTC)


def ms(moment: datetime) -> int:
    return int(moment.timestamp() * 1000)


# -- Pacific days ------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("moment", "day", "reset"),
    [
        # PDT (UTC-7): the day flips at 07:00 UTC.
        (utc(2026, 10, 12, 6, 59, 59), "2026-10-11", utc(2026, 10, 12, 7)),
        (utc(2026, 10, 12, 7, 0, 0), "2026-10-12", utc(2026, 10, 13, 7)),
        # The last PDT day: 2026-10-31 local, next midnight is still PDT.
        (utc(2026, 11, 1, 6, 30), "2026-10-31", utc(2026, 11, 1, 7)),
        # 2026-11-01 is 25 hours long; the following midnight is PST (08:00 UTC).
        (utc(2026, 11, 1, 7, 0), "2026-11-01", utc(2026, 11, 2, 8)),
        (utc(2026, 11, 2, 7, 59), "2026-11-01", utc(2026, 11, 2, 8)),
        (utc(2026, 11, 2, 8, 0), "2026-11-02", utc(2026, 11, 3, 8)),
        # Spring forward (2027-03-14): back to 07:00 UTC.
        (utc(2027, 3, 14, 7, 59), "2027-03-13", utc(2027, 3, 14, 8)),
        (utc(2027, 3, 14, 8, 0), "2027-03-14", utc(2027, 3, 15, 7)),
    ],
)
def test_pacific_day_and_reset(moment: datetime, day: str, reset: datetime) -> None:
    assert pacific.day_key(moment) == day
    assert pacific.next_reset(moment) == reset
    assert pacific.next_reset(moment) > moment


def test_pacific_helpers() -> None:
    assert pacific.month_key(utc(2026, 11, 1, 6)) == "m-2026-10"
    assert pacific.iso_utc(utc(2026, 10, 12, 7)) == "2026-10-12T07:00:00Z"
    assert pacific.day_key(utc(2026, 10, 12, 1), "Asia/Kolkata") == "2026-10-12"
    with pytest.raises(ValueError, match="aware"):
        pacific.day_key(datetime(2026, 1, 1))  # naive on purpose


# -- meter -------------------------------------------------------------------------------

T0 = utc(2026, 10, 12, 12)


@pytest.fixture
def clock() -> FixedClock:
    return FixedClock(ms(T0))


def test_meter_counts_store_ops(clock: FixedClock) -> None:
    store = MemoryStore()
    meter = Meter(store, clock, tz="America/Los_Angeles", persist_enabled=False)
    store.ping()
    store.add_usage("x", {"reads": 1})
    meter.add_app_egress(500)
    assert meter.today() == {"reads": 1, "writes": 1, "deletes": 0, "fsEgress": 0, "appEgress": 500}
    clock.advance(24 * 3600 * 1000)  # a new Pacific day starts from zero
    assert meter.today()["writes"] == 0
    assert meter.persist() is False  # memory store: in-process only


def test_meter_set_today_and_reset(clock: FixedClock) -> None:
    meter = Meter(MemoryStore(), clock, tz="America/Los_Angeles", persist_enabled=False)
    meter.set_today(writes=19_000, reads=10)
    assert (meter.today()["writes"], meter.today()["reads"]) == (19_000, 10)
    with pytest.raises(ValueError, match="counter"):
        meter.set_today(bogus=1)
    meter.reset()
    assert meter.today()["writes"] == 0


class UsageStore(MemoryStore):
    """A memory store pretending to be persistent, to exercise load/persist."""

    kind = "fake-persistent"


def test_meter_load_and_persist(clock: FixedClock) -> None:
    store = UsageStore()
    day = pacific.day_key(T0)
    store.add_usage(day, {"writes": 100, "reads": 7})
    store.ops.reset()
    meter = Meter(store, clock, tz="America/Los_Angeles", persist_enabled=True)
    assert meter.persist() is False  # not before the boot load
    meter.load()
    assert meter.load_state == "done"
    assert meter.today()["writes"] == 100 + 0  # the load itself is a read
    assert meter.today()["reads"] == 7 + 1
    assert meter.persist() is True  # the load's read is activity worth recording
    assert store.dump()["usage"][day]["reads"] == 7 + 1  # dump() is not billed
    # The persist write is counted, but alone it never triggers another write.
    writes_before = store.dump()["usage"][day]["writes"]
    assert meter.persist() is False
    store.ping()
    assert meter.persist() is True
    usage = store.dump()["usage"][day]
    assert usage["writes"] == writes_before + 1  # the previous persist's own write, carried along
    assert meter.today()["writes"] == usage["writes"] + 1  # plus this persist's write (pending)


def test_meter_keeps_deltas_when_persist_fails(clock: FixedClock) -> None:
    store = UsageStore()
    meter = Meter(store, clock, tz="America/Los_Angeles", persist_enabled=True)
    meter.load()
    meter.add_app_egress(10)
    store.fail_next("add_usage", Unavailable("down"))
    assert meter.persist() is False
    assert meter.last_persist_error == "down"
    assert meter.persist() is True
    day = pacific.day_key(T0)
    assert store.dump()["usage"][day]["appEgress"] == 10


def test_meter_load_failure_is_not_fatal(clock: FixedClock) -> None:
    store = UsageStore()
    store.fail_next("get_usage", Unavailable("no network"))
    meter = Meter(store, clock, tz="America/Los_Angeles", persist_enabled=True)
    meter.load()
    assert meter.load_state == "failed"
    meter.add_app_egress(1)
    assert meter.persist() is True


# -- guard -------------------------------------------------------------------------------


def make_guard(clock: FixedClock, **overrides: object) -> tuple[Guard, Meter]:
    settings = Settings(**overrides)  # type: ignore[arg-type]
    meter = Meter(MemoryStore(), clock, tz=settings.quota_tz, persist_enabled=False)
    return Guard(settings, meter, clock, rng=lambda: 0.5), meter


@pytest.mark.parametrize(
    ("writes", "tier", "flush_ms", "hidden_ms", "refresh_ms"),
    [
        (0, 1, 120_000, 0, 60_000),
        (9_499, 1, 120_000, 0, 60_000),  # f < 0.5 of B = 19,000
        (9_500, 2, 300_000, 60_000, 120_000),
        (15_199, 2, 300_000, 60_000, 120_000),
        (15_200, 3, 900_000, 60_000, 300_000),
        (18_999, 3, 900_000, 60_000, 300_000),
        (19_000, "paused", 900_000, 60_000, 300_000),
        (25_000, "paused", 900_000, 60_000, 300_000),
    ],
)
def test_tiers(
    clock: FixedClock, writes: int, tier: object, flush_ms: int, hidden_ms: int, refresh_ms: int
) -> None:
    guard, meter = make_guard(clock)
    meter.set_today(writes=writes)
    policy = guard.policy()
    assert (policy.tier, policy.flush_ms, policy.hidden_min_ms, policy.refresh_ms) == (
        tier,
        flush_ms,
        hidden_ms,
        refresh_ms,
    )
    if tier == "paused":
        assert policy.paused_until == pacific.next_reset(T0)
        assert policy.to_json()["pausedUntil"] == "2026-10-13T07:00:00Z"
        assert guard.sync_block("u") == pacific.next_reset(T0)
    else:
        assert policy.paused_until is None
        assert policy.to_json()["pausedUntil"] is None
        assert guard.sync_block("u") is None


def test_read_pressure_stretches_refresh(clock: FixedClock) -> None:
    guard, meter = make_guard(clock)
    meter.set_today(reads=44_999)
    assert guard.policy().refresh_ms == 60_000
    meter.set_today(reads=45_000)  # 90% of 50,000
    assert guard.policy().refresh_ms == 300_000


def test_quota_enforce_off(clock: FixedClock) -> None:
    guard, meter = make_guard(clock, quota_enforce=False)
    meter.set_today(writes=1_000_000, reads=1_000_000)
    policy = guard.policy("u")
    assert (policy.tier, policy.refresh_ms, policy.paused_until) == (1, 60_000, None)
    assert guard.sync_block("u") is None


def test_custom_tiers(clock: FixedClock) -> None:
    guard, _ = make_guard(clock, sync_tiers=parse_sync_tiers("1:30:0:30"))
    assert guard.policy().to_json() == {
        "tier": 1,
        "flushMs": 30_000,
        "hiddenMinMs": 0,
        "refreshMs": 30_000,
        "pausedUntil": None,
    }


def test_breaker_trip_probe_and_close(clock: FixedClock) -> None:
    guard, _ = make_guard(clock)
    reset = pacific.next_reset(T0)
    until = guard.trip("writes", reset)
    assert until == reset + timedelta(seconds=150)  # jitter 0.5 x 300 s
    assert guard.sync_block("u") == until  # fails fast
    assert guard.policy().tier == "paused"
    assert guard.policy().paused_until == until
    clock.advance(int(PROBE_INTERVAL.total_seconds() * 1000) - 1)
    assert guard.sync_block("u") == until
    clock.advance(1)
    assert guard.sync_block("u") is None  # one probe every 15 min
    assert guard.sync_block("u") == until  # ...and only one
    guard.note_success("writes")  # the probe got through
    assert guard.sync_block("u") is None
    assert guard.policy().tier == 1


def test_breaker_expires_at_reset(clock: FixedClock) -> None:
    guard, _ = make_guard(clock)
    until = guard.trip("reads", pacific.next_reset(T0))
    assert guard.read_block() == until
    clock.set(ms(until))
    assert guard.read_block() is None
    assert guard.breaker_until("reads") is None


def test_breaker_unknown_kind_maps_to_writes(clock: FixedClock) -> None:
    guard, _ = make_guard(clock)
    guard.trip("mystery", pacific.next_reset(T0))
    assert guard.breaker_until("writes") is not None


def test_per_user_cap(clock: FixedClock) -> None:
    guard, _ = make_guard(clock, user_writes_per_day=3)
    guard.record_user_writes("a", 2)
    assert guard.sync_block("a") is None
    guard.record_user_writes("a", 1)
    assert guard.sync_block("a") == pacific.next_reset(T0)
    assert guard.policy("a").tier == "paused"
    assert guard.policy("b").tier == 1  # other users unaffected
    assert guard.sync_block("b") is None
    clock.set(ms(pacific.next_reset(T0)))  # a new Pacific day
    assert guard.sync_block("a") is None
    guard.record_user_writes("a", 3)
    guard.reset()
    assert guard.user_writes("a") == 0
