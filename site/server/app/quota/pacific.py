"""Quota days: Firestore's free-tier counters reset at midnight Pacific time.

`day_key` names the usage document of the day (`YYYY-MM-DD` in QUOTA_TZ) and
`next_reset` gives the next local midnight as an aware UTC datetime. Midnight in
America/Los_Angeles is 07:00 UTC during daylight time and 08:00 UTC after the switch
back to standard time (2026-11-01), which zoneinfo handles for us.
"""

from __future__ import annotations

from datetime import UTC, datetime, time, timedelta
from functools import lru_cache
from zoneinfo import ZoneInfo

DEFAULT_TZ = "America/Los_Angeles"


@lru_cache(maxsize=8)
def zone(name: str = DEFAULT_TZ) -> ZoneInfo:
    return ZoneInfo(name)


def _aware(moment: datetime) -> datetime:
    if moment.tzinfo is None:
        raise ValueError("quota times must be timezone-aware")
    return moment


def local_date(moment: datetime, tz: str = DEFAULT_TZ) -> datetime:
    return _aware(moment).astimezone(zone(tz))


def day_key(moment: datetime, tz: str = DEFAULT_TZ) -> str:
    """`YYYY-MM-DD` of the quota day containing `moment`."""
    return local_date(moment, tz).strftime("%Y-%m-%d")


def month_key(moment: datetime, tz: str = DEFAULT_TZ) -> str:
    """`m-YYYY-MM`: the monthly usage document (egress is billed per month)."""
    return "m-" + local_date(moment, tz).strftime("%Y-%m")


def next_reset(moment: datetime, tz: str = DEFAULT_TZ) -> datetime:
    """The next local midnight after `moment`, in UTC."""
    local = local_date(moment, tz)
    tomorrow = local.date() + timedelta(days=1)
    midnight = datetime.combine(tomorrow, time(0, 0), tzinfo=zone(tz))
    return midnight.astimezone(UTC)


def iso_utc(moment: datetime) -> str:
    """`2026-10-12T07:00:00Z`: the wire format for `retryAt` / `pausedUntil`."""
    return _aware(moment).astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
