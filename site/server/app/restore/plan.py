"""The restore plan: what a validated backup would do to the target (build-contracts.md section 24).

Read-only against the target. In batches of 500 records it looks up which users exist
and the stored stamps of each hub document (`restore_lookup`), and which uids the target
has tombstoned (`is_tombstoned`):

    users     new | existing (an existing user is kept as it is in merge mode)
    progress  newer (absent or older in the target: written) | older | identical (kept)
    skipped   uids tombstoned in the backup or in the target, never restored

Firestore targets also get `estWrites`, `daysNeeded` and `fitsToday` (a merge writes
about one document per new user, per hub document with a newer part and per tombstone,
plus one checkpoint per batch). On Firestore the lookups cost one read per user and per
hub document; when that would take more than 80% of today's remaining reads the plan
counts the backup only (`compared: false`) and estimates writes from the counts.
"""

from __future__ import annotations

import math
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from app.backup.reader import iter_ready
from app.store.base import Store, tombstone_hash

BATCH = 500
FS_BATCH_DOCS = 399  # restore WriteBatch: 399 records + the checkpoint document
READ_SHARE = 0.8


def _batches(ready: Path) -> Iterator[tuple[set[str], list[dict[str, Any]]]]:
    """(backup tombstones so far, user/progress records) in batches; tombstones come first."""
    stones: set[str] = set()
    batch: list[dict[str, Any]] = []
    for _, rec in iter_ready(ready):
        kind = rec.get("t")
        if kind == "tombstone":
            stones.add(rec["h"])
        elif kind in ("user", "progress"):
            batch.append(rec)
            if len(batch) >= BATCH:
                yield stones, batch
                batch = []
    if batch:
        yield stones, batch


def build_plan(
    store: Store,
    ready: Path,
    counts: dict[str, int],
    *,
    reads_left: int | None = None,
    writes_left: int | None = None,
    writes_per_day: int = 20_000,
) -> dict[str, Any]:
    firestore = store.kind == "firestore"
    lookups = counts.get("user", 0) * 2 + counts.get("progress", 0)
    compared = not (firestore and reads_left is not None and lookups > READ_SHARE * reads_left)
    users = {"new": 0, "existing": 0}
    progress = {"newer": 0, "older": 0, "identical": 0}
    skipped = {
        "tombstonedInBackup": {"user": 0, "progress": 0},
        "tombstonedInTarget": {"user": 0, "progress": 0},
    }
    target_tomb: dict[str, bool] = {}
    docs_written: set[tuple[str, str]] = set()
    all_docs: set[tuple[str, str]] = set()
    for stones, batch in _batches(ready):
        live: list[dict[str, Any]] = []
        unknown = sorted({r["uid"] for r in batch} - set(target_tomb))
        if compared and unknown:
            hashes = {tombstone_hash(uid): uid for uid in unknown}
            found = store.is_tombstoned(list(hashes))
            for h, uid in hashes.items():
                target_tomb[uid] = h in found
        for rec in batch:
            kind = rec["t"]
            if tombstone_hash(rec["uid"]) in stones:
                skipped["tombstonedInBackup"][kind] += 1
            elif target_tomb.get(rec["uid"]):
                skipped["tombstonedInTarget"][kind] += 1
            else:
                live.append(rec)
        all_docs.update((r["uid"], r["hub"]) for r in live if r["t"] == "progress")
        if not compared:
            continue
        uids = sorted({r["uid"] for r in live if r["t"] == "user"})
        docs = sorted({(r["uid"], r["hub"]) for r in live if r["t"] == "progress"})
        existing, stamps = store.restore_lookup(uids, docs)
        for rec in live:
            if rec["t"] == "user":
                users["existing" if rec["uid"] in existing else "new"] += 1
                continue
            stored = stamps.get((rec["uid"], rec["hub"]), {}).get(rec["part"])
            if stored is None or rec["upd"] > stored:
                progress["newer"] += 1
                docs_written.add((rec["uid"], rec["hub"]))
            elif rec["upd"] == stored:
                progress["identical"] += 1
            else:
                progress["older"] += 1
    plan: dict[str, Any] = {"compared": compared, "skipped": skipped}
    if compared:
        plan["users"] = users
        plan["progress"] = progress
    if firestore:
        records = sum(counts.values())
        docs = len(docs_written) if compared else len(all_docs)
        new_users = users["new"] if compared else counts.get("user", 0)
        est = new_users + docs + counts.get("tombstone", 0) + math.ceil(records / FS_BATCH_DOCS)
        plan["estWrites"] = est
        plan["daysNeeded"] = max(1, math.ceil(est / max(1, writes_per_day))) if est else 0
        plan["fitsToday"] = writes_left is not None and est <= writes_left
    return plan
