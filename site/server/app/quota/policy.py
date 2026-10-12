"""The sync policy sent with every progress, sync and me response (build-contracts.md section 10).

    {"tier": 1|2|3|"paused", "flushMs": n, "hiddenMinMs": n, "refreshMs": n, "pausedUntil": ISO|null}

The bridge batches saves by `flushMs`, flushes a hidden tab only after `hiddenMinMs`
since the last success, re-checks the server copy every `refreshMs` and, while
`tier == "paused"`, holds everything until `pausedUntil`.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal

from app.config import SyncTier
from app.quota.pacific import iso_utc

Tier = int | Literal["paused"]


@dataclass(frozen=True, slots=True)
class Policy:
    tier: Tier
    flush_ms: int
    hidden_min_ms: int
    refresh_ms: int
    paused_until: datetime | None = None

    @property
    def paused(self) -> bool:
        return self.tier == "paused"

    @classmethod
    def from_tier(cls, number: Tier, tier: SyncTier, *, refresh_factor: int = 1) -> Policy:
        return cls(
            tier=number,
            flush_ms=tier.flush_s * 1000,
            hidden_min_ms=tier.hidden_min_s * 1000,
            refresh_ms=tier.refresh_s * 1000 * refresh_factor,
        )

    def to_json(self) -> dict[str, Any]:
        return {
            "tier": self.tier,
            "flushMs": self.flush_ms,
            "hiddenMinMs": self.hidden_min_ms,
            "refreshMs": self.refresh_ms,
            "pausedUntil": iso_utc(self.paused_until) if self.paused_until else None,
        }
