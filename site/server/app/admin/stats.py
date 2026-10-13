"""`GET /api/admin/stats` (build-contracts.md section 19, spec section 4.9).

Cost per view: `count()` of users (1 read per 1,000), `meta/backups` (1 read), the
daily usage docs of the month before today (at most 30 reads, cached for an hour
since past days never change) and a missed-jobs query (at least 1 read). Everything
else comes from the in-process meter, guard, settings and scheduler caches.
`host.instanceHoursMonth` and `migrationTriggers` are left out (not computable here).
"""

from __future__ import annotations

import threading
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from app.admin.backups import read_meta
from app.quota.pacific import iso_utc, local_date, next_reset, zone

FIRESTORE_STORAGE_LIMIT = 1_073_741_824  # Spark: 1 GiB stored
FIRESTORE_EGRESS_LIMIT = 10_737_418_240  # Spark: 10 GiB a month
DEFAULT_RAM_LIMIT = 536_870_912  # Render free: 512 MiB
MONTH_CACHE_S = 3600.0


def rss_bytes() -> int | None:
    try:
        fields = Path("/proc/self/statm").read_text().split()
        import os

        return int(fields[1]) * os.sysconf("SC_PAGE_SIZE")
    except (OSError, ValueError, IndexError):
        return None


def ram_limit() -> int:
    for path in ("/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"):
        try:
            value = Path(path).read_text().strip()
        except OSError:
            continue
        if value.isdigit() and 0 < int(value) < 1 << 50:
            return int(value)
    return DEFAULT_RAM_LIMIT


class MonthUsage:
    """Sum of the persisted daily usage docs of this month before today (cached 1 h)."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._cache: tuple[str, float, dict[str, int]] | None = None

    def earlier_days(self, store: Any, today: date) -> dict[str, int]:
        key = today.isoformat()
        with self._lock:
            if self._cache and self._cache[0] == key and time.monotonic() - self._cache[1] < MONTH_CACHE_S:
                return dict(self._cache[2])
        days = [(today.replace(day=1) + timedelta(days=i)).isoformat() for i in range(today.day - 1)]
        totals: dict[str, int] = {}
        if days and store.kind != "memory":  # the memory meter is in-process only
            for row in store.get_usage(days).values():
                for name, value in row.items():
                    totals[name] = totals.get(name, 0) + int(value)
        with self._lock:
            self._cache = (key, time.monotonic(), totals)
        return dict(totals)

    def reset(self) -> None:
        with self._lock:
            self._cache = None


MONTH = MonthUsage()


def _local_label(moment: datetime, tz: str) -> str:
    local = moment.astimezone(zone(tz))
    return f"{local:%H:%M} {local.tzname()}"


def build_stats(runtime: Any) -> dict[str, Any]:
    """Blocking (store reads): call from a worker thread."""
    settings = runtime.settings
    store = runtime.store
    meter, guard = runtime.meter, runtime.guard
    now = runtime.clock.now()
    today = meter.today()
    reset = next_reset(now, settings.quota_tz)
    site = runtime.site.current()
    users = store.count_users()
    meta, _ = read_meta(store)
    earlier = MONTH.earlier_days(store, local_date(now, settings.quota_tz).date())
    fs_egress = earlier.get("fsEgress", 0) + today.get("fsEgress", 0)
    app_egress = earlier.get("appEgress", 0) + today.get("appEgress", 0)
    missed = store.list_jobs({"missed"}, limit=5)
    policy = guard.policy()
    tier = guard.tier_number()
    storage = meta["storage"] or {}
    return {
        "store": settings.store,
        "users": users,
        "quotaDay": {
            "day": meter.day(),
            "resetsAt": iso_utc(reset),
            "resetsAtLocal": _local_label(reset, site.tz),
            "tz": site.tz,
        },
        "firestore": {
            "writes": {
                "used": today["writes"],
                "limit": settings.quota_writes,
                "budget": int(settings.write_budget),
                "tier": tier if tier is not None else "paused",
            },
            "reads": {"used": today["reads"], "limit": settings.quota_reads},
            "deletes": {"used": today["deletes"], "limit": settings.quota_deletes},
            "storage": {
                "estBytes": storage.get("estBytes"),
                "docs": storage.get("docs"),
                "limit": FIRESTORE_STORAGE_LIMIT,
                "asOf": storage.get("asOf"),
            },
            "egressMonth": {"bytes": fs_egress, "limit": FIRESTORE_EGRESS_LIMIT},
        },
        "host": {
            "egressMonth": {"bytes": app_egress, "limit": settings.host_egress_month},
            "rssBytes": rss_bytes(),
            "ramLimit": ram_limit(),
        },
        "breakers": {kind: _iso_or_none(guard.breaker_until(kind)) for kind in ("writes", "reads")},
        "maintenance": {**runtime.maintenance(), "forced": runtime.site.forced},
        "upcoming": runtime.upcoming(),
        "jobs": runtime.scheduler.active()[:10] if runtime.scheduler is not None else [],
        "missedJobs": missed,
        "lastBackup": meta["log"][-1] if meta["log"] else None,
        "tier": policy.tier,
        "policy": policy.to_json(),
        "settings": {"tz": site.tz, "notice": site.notice},
        "adminTz": settings.admin_tz,
    }


def _iso_or_none(moment: datetime | None) -> str | None:
    return iso_utc(moment) if moment is not None else None
