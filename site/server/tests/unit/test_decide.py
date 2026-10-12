"""decide(): the newest-wins table (build-contracts.md section 10)."""

from __future__ import annotations

import pytest

from app.progress.decide import decide

T = 1_760_000_000_000


@pytest.mark.parametrize(
    ("stored", "incoming", "expected"),
    [
        (None, T, "accepted"),  # nothing stored yet
        (None, 1, "accepted"),
        (T, T + 1, "accepted"),  # newer
        (T, T, "duplicate"),  # same stamp: no write
        (T, T - 1, "stale"),  # older: no write
        (T, 0, "stale"),
        (0, 0, "duplicate"),
    ],
)
def test_decide_table(stored: int | None, incoming: int, expected: str) -> None:
    assert decide(stored, incoming) == expected
