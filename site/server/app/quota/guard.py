"""Quota guard: tiers, the daily write budget, the quota breaker and the per-user cap.

build-contracts.md section 12:
- `f = writes_today / B` with `B = QUOTA_WRITES x (1 - QUOTA_RESERVE)` picks the tier
  from SYNC_TIERS (the first tier whose `frac` is above `f`). At or above the last
  tier's `frac` (1.0 by default) sync is paused until the next Pacific midnight.
- A `QuotaExhausted` from the store trips the breaker for that kind ("reads" or
  "writes"): calls fail fast until the reset plus 0-5 minutes of jitter, except one
  probe every 15 minutes. A probe that succeeds closes the breaker.
- Reads at or above 90% of QUOTA_READS multiply `refreshMs` by 5.
- `USER_WRITES_PER_DAY` caps the accepted hub-document writes per uid and Pacific day.
- QUOTA_ENFORCE=0 disables the tiers, the budget and the read stretch (Postgres in
  M3): the policy stays at tier 1. The breaker (a real backend refusal) and the
  per-user cap (abuse protection) still apply.
"""

from __future__ import annotations

import logging
import random
import threading
from collections.abc import Callable
from datetime import datetime, timedelta

from app.clock import Clock
from app.config import Settings
from app.quota.meter import Meter
from app.quota.pacific import day_key, next_reset
from app.quota.policy import Policy

logger = logging.getLogger(__name__)

PROBE_INTERVAL = timedelta(minutes=15)
MAX_JITTER_S = 300.0
READ_PRESSURE = 0.9
READ_STRETCH = 5
BREAKER_KINDS = ("reads", "writes", "deletes")


class Guard:
    def __init__(
        self,
        settings: Settings,
        meter: Meter,
        clock: Clock,
        *,
        rng: Callable[[], float] = random.random,
    ) -> None:
        self._settings = settings
        self._meter = meter
        self._clock = clock
        self._rng = rng
        self._lock = threading.Lock()
        self._paused: dict[str, datetime] = {}  # breaker: kind -> paused until
        self._last_probe: dict[str, datetime] = {}
        self._user_writes: dict[str, dict[str, int]] = {}  # day -> uid -> accepted doc writes

    # -- budget and tiers ----------------------------------------------------------------

    @property
    def enforce(self) -> bool:
        return bool(self._settings.quota_enforce)

    def fraction(self) -> float:
        return self._meter.today()["writes"] / self._settings.write_budget

    def next_reset(self) -> datetime:
        return next_reset(self._clock.now(), self._settings.quota_tz)

    def budget_paused(self) -> bool:
        return self.enforce and self.fraction() >= self._settings.sync_tiers[-1].frac

    def tier_number(self) -> int | None:
        """1-based tier for today's write fraction, or None when the budget is spent."""
        if not self.enforce:
            return 1
        f = self.fraction()
        for number, tier in enumerate(self._settings.sync_tiers, start=1):
            if f < tier.frac:
                return number
        return None

    def read_stretch(self) -> int:
        if not self.enforce:
            return 1
        reads = self._meter.today()["reads"]
        return READ_STRETCH if reads >= READ_PRESSURE * self._settings.quota_reads else 1

    def policy(self, uid: str | None = None) -> Policy:
        tiers = self._settings.sync_tiers
        stretch = self.read_stretch()
        number = self.tier_number()
        paused_until: datetime | None = None
        if number is None:
            paused_until = self.next_reset()
        for kind in ("writes", "reads"):
            until = self.breaker_until(kind)
            if until is not None:
                paused_until = max(paused_until or until, until)
        if uid is not None and self.user_capped(uid):
            reset = self.next_reset()
            paused_until = max(paused_until or reset, reset)
        if paused_until is not None:
            policy = Policy.from_tier("paused", tiers[-1], refresh_factor=stretch)
            return Policy(policy.tier, policy.flush_ms, policy.hidden_min_ms, policy.refresh_ms, paused_until)
        number = number or len(tiers)  # always set here: a spent budget returned above
        return Policy.from_tier(number, tiers[number - 1], refresh_factor=stretch)

    # -- request gates -----------------------------------------------------------------

    def sync_block(self, uid: str) -> datetime | None:
        """When a sync must be refused (429 sync_paused), the moment it may retry."""
        if self.user_capped(uid) or self.budget_paused():
            return self.next_reset()
        for kind in ("writes", "reads"):
            until = self.breaker_check(kind)
            if until is not None:
                return until
        return None

    def read_block(self) -> datetime | None:
        """When reads must fail fast (breaker open, no probe due), the moment to retry."""
        return self.breaker_check("reads")

    # -- breaker -----------------------------------------------------------------------

    def trip(self, kind: str, retry_at: datetime) -> datetime:
        """Open the breaker for `kind` until `retry_at` plus 0-5 minutes of jitter."""
        if kind not in BREAKER_KINDS:
            kind = "writes"
        until = retry_at + timedelta(seconds=self._rng() * MAX_JITTER_S)
        with self._lock:
            current = self._paused.get(kind)
            self._paused[kind] = max(current, until) if current else until
            self._last_probe[kind] = self._clock.now()
            until = self._paused[kind]
        logger.warning("Quota breaker open for %s until %s", kind, until.isoformat())
        return until

    def breaker_until(self, kind: str) -> datetime | None:
        """The breaker's end for `kind`, or None when closed (does not use a probe)."""
        now = self._clock.now()
        with self._lock:
            until = self._paused.get(kind)
            if until is not None and now >= until:
                del self._paused[kind]
                self._last_probe.pop(kind, None)
                return None
            return until

    def breaker_check(self, kind: str) -> datetime | None:
        """None when a call of `kind` may go ahead (closed breaker or a due probe)."""
        until = self.breaker_until(kind)
        if until is None:
            return None
        now = self._clock.now()
        with self._lock:
            last = self._last_probe.get(kind)
            if last is None or now - last >= PROBE_INTERVAL:
                self._last_probe[kind] = now
                logger.info("Quota breaker for %s: letting one probe through", kind)
                return None
        return until

    def note_success(self, *kinds: str) -> None:
        """A call of these kinds succeeded: close their breakers (a probe got through)."""
        with self._lock:
            for kind in kinds:
                if self._paused.pop(kind, None) is not None:
                    self._last_probe.pop(kind, None)
                    logger.info("Quota breaker for %s closed after a successful call", kind)

    # -- per-user cap --------------------------------------------------------------------

    def _today(self) -> str:
        return day_key(self._clock.now(), self._settings.quota_tz)

    def user_writes(self, uid: str) -> int:
        with self._lock:
            return self._user_writes.get(self._today(), {}).get(uid, 0)

    def user_capped(self, uid: str) -> bool:
        return self.user_writes(uid) >= self._settings.user_writes_per_day

    def record_user_writes(self, uid: str, count: int) -> None:
        if count <= 0:
            return
        day = self._today()
        with self._lock:
            table = self._user_writes.setdefault(day, {})
            table[uid] = table.get(uid, 0) + count
            for old in [d for d in self._user_writes if d < day]:
                del self._user_writes[old]

    def reset(self) -> None:
        with self._lock:
            self._paused.clear()
            self._last_probe.clear()
            self._user_writes.clear()
