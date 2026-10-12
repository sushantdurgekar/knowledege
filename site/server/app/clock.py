"""The server clock: wall time in ms plus an offset that only test routes change.

Everything that compares with a client `upd` stamp, picks the Pacific quota day or
stamps an expiry reads time through one `Clock`, so the skew tests (build-contracts
section 15, `POST /api/test/clock`) can move it without patching modules.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime


class Clock:
    def __init__(self, offset_ms: int = 0) -> None:
        self.offset_ms = offset_ms

    def now_ms(self) -> int:
        return time.time_ns() // 1_000_000 + self.offset_ms

    def now(self) -> datetime:
        return datetime.fromtimestamp(self.now_ms() / 1000, UTC)

    def now_s(self) -> float:
        return self.now_ms() / 1000


class FixedClock(Clock):
    """A clock that only moves when told to (unit tests)."""

    def __init__(self, now_ms: int) -> None:
        super().__init__()
        self._now_ms = now_ms

    def now_ms(self) -> int:
        return self._now_ms + self.offset_ms

    def advance(self, ms: int) -> None:
        self._now_ms += ms

    def set(self, now_ms: int) -> None:
        self._now_ms = now_ms
