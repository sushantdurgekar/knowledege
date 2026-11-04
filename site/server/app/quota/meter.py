"""The quota meter: billable store operations and egress per Pacific day.

The store reports every billable operation through its `OpCounter` (a get is 1 read
even for a missing document, a commit is 1 write per document, ...); the meter adds
them to today's counters together with the app's own response bytes (`appEgress`).

Persistence (build-contracts.md section 12):
- `load()` reads today's `usage/{day}` document once at boot, so a restart keeps the
  day's totals (the guard's tiers depend on them).
- `persist()` adds the deltas collected since the last call with `Increment`, every
  10 minutes and on shutdown. A call with nothing new to report writes nothing, and
  the meter's own write is only carried forward together with real activity, so an
  idle server costs nothing.
- With the memory store the meter is in-process only (`persist_enabled=False`).

Thread-safe: the store calls the listener from FastAPI's worker threads.
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime

from app.clock import Clock
from app.quota.pacific import day_key
from app.store.base import USAGE_COUNTERS, OpCounts, Store, StoreError

logger = logging.getLogger(__name__)

PERSIST_INTERVAL_S = 600.0
# Days kept in memory (today and a little history for the day that just ended).
KEEP_DAYS = 3

Counters = dict[str, int]


def _zero() -> Counters:
    return dict.fromkeys(USAGE_COUNTERS, 0)


def _add(into: Counters, delta: Counters) -> None:
    for name, value in delta.items():
        into[name] = into.get(name, 0) + int(value)


class Meter:
    def __init__(self, store: Store, clock: Clock, *, tz: str, persist_enabled: bool) -> None:
        self._store = store
        self._clock = clock
        self._tz = tz
        self.persist_enabled = persist_enabled
        self._lock = threading.Lock()
        self._base: dict[str, Counters] = {}  # loaded from the store (other processes, earlier boots)
        self._local: dict[str, Counters] = {}  # counted by this process
        self._pending: dict[str, Counters] = {}  # counted, not yet persisted
        self._own_pending: dict[str, Counters] = {}  # the meter's own persist writes
        self._external_activity = False
        self._persisting = threading.local()
        self._load_state = "pending" if persist_enabled else "skipped"  # pending|done|failed|skipped
        self.last_persist_error: str | None = None
        store.ops.subscribe(self._on_ops)

    # -- counting --------------------------------------------------------------------

    def day(self, moment: datetime | None = None) -> str:
        return day_key(moment or self._clock.now(), self._tz)

    def _on_ops(self, delta: OpCounts) -> None:
        self.add(
            {
                "reads": delta.reads,
                "writes": delta.writes,
                "deletes": delta.deletes,
                "fsEgress": delta.fs_egress,
            }
        )

    def add(self, delta: Counters) -> None:
        """Count `delta` on today's counters."""
        delta = {k: int(v) for k, v in delta.items() if v}
        if not delta:
            return
        own = getattr(self._persisting, "active", False)
        day = self.day()
        with self._lock:
            _add(self._local.setdefault(day, _zero()), delta)
            if self.persist_enabled:
                bucket = self._own_pending if own else self._pending
                _add(bucket.setdefault(day, {}), delta)
                if not own:
                    self._external_activity = True

    @contextmanager
    def quiet(self) -> Iterator[None]:
        """Count this thread's operations, but do not let them alone cause a persist write.

        For housekeeping that runs on a timer whether or not anyone uses the site (the
        job scheduler's 5-minute re-read): like the meter's own writes, these deltas
        are carried forward with the next real activity, so an idle site writes nothing.
        """
        previous = getattr(self._persisting, "active", False)
        self._persisting.active = True
        try:
            yield
        finally:
            self._persisting.active = previous

    def add_app_egress(self, nbytes: int) -> None:
        if nbytes > 0:
            self.add({"appEgress": nbytes})

    def today(self) -> Counters:
        """Today's totals: what earlier processes persisted plus what this one counted."""
        day = self.day()
        with self._lock:
            out = _zero()
            _add(out, self._base.get(day, {}))
            _add(out, self._local.get(day, {}))
            return out

    def set_today(self, **values: int) -> None:
        """Make today's totals equal `values` (test route `POST /api/test/quota`)."""
        day = self.day()
        with self._lock:
            base = self._base.get(day, {})
            local = self._local.setdefault(day, _zero())
            for name, value in values.items():
                if name not in USAGE_COUNTERS:
                    raise ValueError(f"unknown counter {name!r}")
                local[name] = int(value) - base.get(name, 0)

    def reset(self) -> None:
        with self._lock:
            self._base.clear()
            self._local.clear()
            self._pending.clear()
            self._own_pending.clear()
            self._external_activity = False

    # -- persistence -----------------------------------------------------------------

    @property
    def load_state(self) -> str:
        return self._load_state

    def load(self) -> None:
        """Read today's persisted totals (1 read). Failures are logged, never raised."""
        if not self.persist_enabled:
            return
        day = self.day()
        try:
            found = self._store.get_usage([day])
        except StoreError as exc:
            logger.warning("Quota meter: cannot load usage/%s, counting from zero: %s", day, exc)
            self._load_state = "failed"
            return
        except Exception:  # a broken backend must not stop the server
            logger.exception("Quota meter: unexpected error loading usage/%s", day)
            self._load_state = "failed"
            return
        with self._lock:
            self._base[day] = {k: int(v) for k, v in found.get(day, {}).items() if k in USAGE_COUNTERS}
        self._load_state = "done"
        logger.info("Quota meter loaded usage/%s: %s", day, self._base[day])

    def persist(self) -> bool:
        """Write the pending deltas with Increment. Returns True when something was written.

        Skipped until `load()` has finished (otherwise the loaded base could already
        include deltas this process wrote, counting them twice).
        """
        if not self.persist_enabled or self._load_state == "pending":
            return False
        with self._lock:
            if not self._external_activity:
                return False
            batches: dict[str, Counters] = {}
            for source in (self._pending, self._own_pending):
                for day, delta in source.items():
                    _add(batches.setdefault(day, {}), delta)
            self._pending, self._own_pending = {}, {}
            self._external_activity = False
            self._prune()
        wrote = False
        self._persisting.active = True
        try:
            for day, delta in sorted(batches.items()):
                delta = {k: v for k, v in delta.items() if v}
                if not delta:
                    continue
                try:
                    self._store.add_usage(day, delta)
                    wrote = True
                except Exception as exc:  # keep the deltas for the next attempt
                    self.last_persist_error = str(exc)
                    logger.warning("Quota meter: cannot persist usage/%s: %s", day, exc)
                    with self._lock:
                        _add(self._pending.setdefault(day, {}), delta)
                        self._external_activity = True
        finally:
            self._persisting.active = False
        if wrote:
            self.last_persist_error = None
        return wrote

    def _prune(self) -> None:
        today = self.day()
        for table in (self._base, self._local):
            for day in sorted(table)[:-KEEP_DAYS]:
                if day != today:
                    del table[day]
