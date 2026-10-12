"""Newest wins (build-contracts.md section 10): the one rule every store applies.

A part is stored only when its `upd` is newer than the stored one. Equal stamps are
duplicates and older ones stale; neither is written. Clock-skew checks happen in
validation, before any store call.
"""

from __future__ import annotations

from app.store.base import Status


def decide(stored_upd: int | None, incoming_upd: int) -> Status:
    if stored_upd is None or incoming_upd > stored_upd:
        return "accepted"
    if incoming_upd == stored_upd:
        return "duplicate"
    return "stale"
