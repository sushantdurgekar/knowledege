"""In-memory token buckets (one process, one instance: Render free).

Keys are the client IP (sign-in) or the uid (sync, progress, seed). The client IP is
the X-Forwarded-For entry at position `-TRUSTED_PROXY_HOPS`: the platform appends the
real peer on the right, so anything further left is client-supplied and spoofable.
With 0 hops (local/test) the socket peer is used. uvicorn's --proxy-headers rewrites
the ASGI client from the left-most entry, which is why the raw header is read here.
"""

from __future__ import annotations

import math
import threading
import time
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass

from starlette.requests import Request

MAX_KEYS = 50_000


@dataclass(frozen=True, slots=True)
class Rule:
    name: str
    burst: int  # bucket capacity
    per_second: float  # refill rate

    @classmethod
    def per_minute(cls, name: str, count: int, *, burst: int | None = None) -> Rule:
        return cls(name, burst or count, count / 60)

    @classmethod
    def per_day(cls, name: str, count: int) -> Rule:
        return cls(name, count, count / 86400)


# build-contracts.md sections 9 and 10, spec section 4.7.
SESSION_PER_MINUTE = Rule.per_minute("session:min", 10)
SESSION_PER_DAY = Rule.per_day("session:day", 100)
SYNC = Rule.per_minute("sync", 12, burst=6)
PROGRESS = Rule.per_minute("progress", 60)
SEED = Rule.per_minute("seed", 60)


class RateLimiter:
    def __init__(self, monotonic: Callable[[], float] = time.monotonic, *, max_keys: int = MAX_KEYS) -> None:
        self._now = monotonic
        self._max = max_keys
        self._lock = threading.Lock()
        self._buckets: OrderedDict[tuple[str, str], tuple[float, float]] = OrderedDict()  # tokens, at

    def _level(self, rule: Rule, key: str, now: float) -> float:
        found = self._buckets.get((rule.name, key))
        if found is None:
            return float(rule.burst)
        tokens, at = found
        return min(float(rule.burst), tokens + (now - at) * rule.per_second)

    def hit(self, key: str, *rules: Rule) -> int | None:
        """Take one token from each rule's bucket for `key`.

        Returns None when allowed, else the seconds until a token is available in
        every bucket (nothing is taken when any bucket is empty).
        """
        now = self._now()
        with self._lock:
            levels = [(rule, self._level(rule, key, now)) for rule in rules]
            waits = [(1 - level) / rule.per_second for rule, level in levels if level < 1]
            if waits:
                return max(1, math.ceil(max(waits)))
            for rule, level in levels:
                bucket = (rule.name, key)
                self._buckets[bucket] = (level - 1, now)
                self._buckets.move_to_end(bucket)
            while len(self._buckets) > self._max:
                self._buckets.popitem(last=False)
        return None

    def reset(self) -> None:
        with self._lock:
            self._buckets.clear()


def client_ip(request: Request, hops: int) -> str:
    if hops > 0:
        values = request.headers.getlist("x-forwarded-for")
        entries = [entry.strip() for value in values for entry in value.split(",") if entry.strip()]
        if len(entries) >= hops:
            return entries[-hops]
    client = request.client
    return client.host if client else "unknown"
