"""Token buckets and the client-IP rule (TRUSTED_PROXY_HOPS)."""

from __future__ import annotations

import pytest
from starlette.requests import Request

from app.auth import ratelimit as rl


class Ticker:
    def __init__(self) -> None:
        self.t = 1000.0

    def __call__(self) -> float:
        return self.t


def test_burst_then_refill() -> None:
    tick = Ticker()
    limiter = rl.RateLimiter(tick)
    for _ in range(6):  # sync: burst 6
        assert limiter.hit("uid:a", rl.SYNC) is None
    wait = limiter.hit("uid:a", rl.SYNC)
    assert wait == 5  # 12/min refills one token every 5 s
    tick.t += 5
    assert limiter.hit("uid:a", rl.SYNC) is None
    assert limiter.hit("uid:a", rl.SYNC) is not None
    assert limiter.hit("uid:b", rl.SYNC) is None  # other keys are independent


def test_twelve_per_minute_sustained() -> None:
    tick = Ticker()
    limiter = rl.RateLimiter(tick)
    allowed = 0
    for _ in range(600):  # one request every 0.5 s for 5 minutes
        if limiter.hit("k", rl.SYNC) is None:
            allowed += 1
        tick.t += 0.5
    assert 60 <= allowed <= 66  # 12/min x 5 min, plus the initial burst


def test_session_minute_and_day_limits() -> None:
    tick = Ticker()
    limiter = rl.RateLimiter(tick)
    rules = (rl.SESSION_PER_MINUTE, rl.SESSION_PER_DAY)
    assert all(limiter.hit("ip:1", *rules) is None for _ in range(10))
    assert limiter.hit("ip:1", *rules) is not None
    allowed = 10
    for _ in range(200):  # an attacker retrying all day long
        tick.t += 60
        while limiter.hit("ip:1", *rules) is None:
            allowed += 1
    assert allowed <= 100 + 15  # the daily bucket caps it (plus what refills meanwhile)


def test_denied_hit_takes_no_tokens() -> None:
    tick = Ticker()
    limiter = rl.RateLimiter(tick)
    day = rl.Rule("d", 1, 1 / 86400)
    minute = rl.Rule.per_minute("m", 10)
    assert limiter.hit("k", minute, day) is None
    for _ in range(5):
        assert limiter.hit("k", minute, day) is not None
    tick.t += 86400
    assert limiter.hit("k", minute, day) is None  # minute bucket was not drained by denials


def test_key_table_is_bounded_and_resettable() -> None:
    limiter = rl.RateLimiter(Ticker(), max_keys=100)
    for i in range(1000):
        limiter.hit(f"ip:{i}", rl.PROGRESS)
    assert len(limiter._buckets) == 100
    limiter.reset()
    assert len(limiter._buckets) == 0


def _request(xff: list[str] | None, peer: str = "10.0.0.9") -> Request:
    headers = [(b"x-forwarded-for", value.encode()) for value in (xff or [])]
    return Request({"type": "http", "headers": headers, "client": (peer, 1234)})


@pytest.mark.parametrize(
    ("xff", "hops", "expected"),
    [
        (None, 0, "10.0.0.9"),
        (["1.1.1.1"], 0, "10.0.0.9"),  # local/test: never trust the header
        (["6.6.6.6, 2.2.2.2"], 1, "2.2.2.2"),  # Render appends the real client last
        (["6.6.6.6", "2.2.2.2"], 1, "2.2.2.2"),  # several header lines
        (["6.6.6.6, 2.2.2.2, 3.3.3.3"], 2, "2.2.2.2"),
        ([], 1, "10.0.0.9"),
        (["2.2.2.2"], 2, "10.0.0.9"),  # fewer entries than hops: the peer
    ],
)
def test_client_ip(xff: list[str] | None, hops: int, expected: str) -> None:
    assert rl.client_ip(_request(xff), hops) == expected
