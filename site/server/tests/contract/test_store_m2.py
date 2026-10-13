"""The M2 store contract (build-contracts.md sections 18-19, 22): account listing and
deletion, tombstones, document-id scans, counts and jobs, on memory and the emulator.

Scans run on `fresh`, an adapter with an empty database of its own (a new emulator
project), so they can check the exact set of documents and the exact billing.
"""

from __future__ import annotations

import gzip
import json
import threading
from datetime import UTC, datetime
from typing import Any

import pytest

from app.store.base import (
    PartIn,
    PartInfo,
    Unavailable,
    UserRecord,
    new_job_id,
    progress_doc_id,
    tombstone_hash,
)
from tests.contract.conftest import Adapter

T = 1_790_000_000_000
NOW_MS = T + 3_600_000
AT = datetime(2026, 10, 12, 9, 30, tzinfo=UTC)
N = 1_234
PAGE = 100


def part(upd: int, data: Any = None, done: int | None = None) -> PartIn:
    raw = json.dumps({"upd": upd, "data": data if data is not None else {"x": upd}}, separators=(",", ":"))
    blob = raw.encode()
    return PartIn(upd=upd, gz=gzip.compress(blob, mtime=0), raw_len=len(blob), done=done)


def seed_progress(adapter: Adapter, n: int) -> dict[tuple[str, str], dict[str, PartIn]]:
    """n hub documents over n // 3 + 1 users, written straight to the backend."""
    docs: dict[tuple[str, str], dict[str, PartIn]] = {}
    for i in range(n):
        uid, hub = f"u{i // 3:05d}", ("ai103", "dsa-l1", "ai901")[i % 3]
        parts = {"legacy": part(T + i)} if hub == "ai901" else {"main": part(T + i), "cards": part(T + i + 1)}
        docs[(uid, hub)] = parts
    if adapter.kind == "memory":
        for (uid, hub), parts in docs.items():
            adapter.store.put_parts(uid, hub, parts, NOW_MS)
        return docs
    db = adapter.store.db  # type: ignore[attr-defined]
    items = list(docs.items())
    for start in range(0, len(items), 400):
        batch = db.batch()
        for (uid, hub), parts in items[start : start + 400]:
            fields: dict[str, Any] = {"uid": uid, "hub": hub, "done": 1}
            for name, p in parts.items():
                fields.update({f"u_{name}": p.upd, f"p_{name}": p.gz, f"n_{name}": p.raw_len})
            batch.set(db.collection("progress").document(progress_doc_id(uid, hub)), fields)
        batch.commit()
    return docs


def seed_users_and_tombstones(adapter: Adapter, n: int) -> None:
    store = adapter.store
    if adapter.kind == "memory":
        for i in range(n):
            user = UserRecord(f"u{i:05d}", f"u{i}@example.com", last_login_at=AT)
            store.upsert_user(user, touch_login=True)
            store.put_tombstone(f"{i:064x}", AT)
        return
    db = store.db  # type: ignore[attr-defined]
    for start in range(0, n, 200):
        batch = db.batch()
        for i in range(start, min(n, start + 200)):
            batch.set(
                db.collection("users").document(f"u{i:05d}"),
                {"email": f"u{i}@example.com", "emailVerified": True, "createdAt": AT, "lastLoginAt": AT},
            )
            batch.set(db.collection("tombstones").document(f"{i:064x}"), {"at": AT})
        batch.commit()


def reads_of(adapter: Adapter, before: tuple[int, int]) -> int:
    return adapter.counts()[0] - before[0]


# -- scans ----------------------------------------------------------------------------------


def test_iter_progress_exact_ordered_no_duplicates(fresh: Adapter) -> None:
    docs = seed_progress(fresh, N)
    before, wire = fresh.counts(), fresh.wire_counts()
    seen = list(fresh.store.iter_progress(page=PAGE))
    keys = [(uid, hub) for uid, hub, _ in seen]
    assert len(keys) == N == len(set(keys))  # exact, no duplicates
    assert [progress_doc_id(*k) for k in keys] == sorted(progress_doc_id(*k) for k in docs)  # id order
    for uid, hub, parts in seen:
        sent = docs[(uid, hub)]
        assert set(parts) == set(sent)
        for name, out in parts.items():
            assert (out.upd, out.gz) == (sent[name].upd, sent[name].gz)
    assert reads_of(fresh, before) == N  # 12 full pages + 34: one read per document
    if fresh.api is not None:
        assert fresh.wire_counts()[0] - wire[0] == N


def test_iter_progress_is_lazy(fresh: Adapter) -> None:
    seed_progress(fresh, 250)
    before = fresh.counts()
    iterator = fresh.store.iter_progress(page=PAGE)
    next(iterator)
    assert reads_of(fresh, before) == PAGE  # one page in memory, not the collection
    rest = sum(1 for _ in iterator)
    assert rest == 249


def test_iter_users_and_tombstones(fresh: Adapter) -> None:
    seed_users_and_tombstones(fresh, N)
    before = fresh.counts()
    users = list(fresh.store.iter_users(page=PAGE))
    uids = [u.uid for u in users]
    assert uids == sorted(uids) == [f"u{i:05d}" for i in range(N)]
    assert users[7].email == "u7@example.com"
    assert users[7].last_login_at == AT
    stones = list(fresh.store.iter_tombstones(page=PAGE))
    assert [t.h for t in stones] == [f"{i:064x}" for i in range(N)]
    assert all(t.at == AT for t in stones)
    assert reads_of(fresh, before) == 2 * N


def test_scan_of_an_empty_collection_costs_one_read(fresh: Adapter) -> None:
    before = fresh.counts()
    assert list(fresh.store.iter_users(page=PAGE)) == []
    assert reads_of(fresh, before) == 1
    with pytest.raises(ValueError, match="page"):
        list(fresh.store.iter_progress(page=0))


def test_full_last_page_costs_one_more_read(fresh: Adapter) -> None:
    seed_progress(fresh, 200)
    before = fresh.counts()
    assert sum(1 for _ in fresh.store.iter_progress(page=PAGE)) == 200
    assert reads_of(fresh, before) == 201  # two full pages, then an empty one


def test_counts_and_storage_scan(fresh: Adapter) -> None:
    docs = seed_progress(fresh, 30)
    seed_users_and_tombstones(fresh, 12)
    before = fresh.counts()
    assert fresh.store.count_docs("progress") == 30
    assert fresh.store.count_docs("users") == 12
    assert fresh.store.count_docs("tombstones") == 12
    assert reads_of(fresh, before) == 3  # count(): 1 read per 1,000 entries
    with pytest.raises(ValueError, match="unknown"):
        fresh.store.count_docs("usage")
    before = fresh.counts()
    total = sum(p.raw_len for ps in docs.values() for p in ps.values())
    assert fresh.store.storage_scan(page=7) == (30, total)
    assert reads_of(fresh, before) == 30


# -- account ---------------------------------------------------------------------------------


def test_list_hubs(adapter: Adapter, uid: str) -> None:
    store = adapter.store
    store.put_parts(uid, "ai103", {"main": part(T + 1, done=4), "cards": part(T + 2)}, NOW_MS)
    store.put_parts(uid, "ai901", {"legacy": part(T + 3, done=2)}, NOW_MS)
    store.put_parts(uid + "a", "ai103", {"main": part(T)}, NOW_MS)  # neighbours in id order
    store.put_parts(uid[:-1], "zz", {"main": part(T)}, NOW_MS)
    before = adapter.counts()
    hubs = store.list_hubs(uid)
    assert reads_of(adapter, before) == 2  # one id-range query: 1 read per doc
    assert [h.hub for h in hubs] == ["ai103", "ai901"]
    main = part(T + 1, done=4)
    cards = part(T + 2)
    assert hubs[0].parts == {"main": PartInfo(T + 1, main.raw_len), "cards": PartInfo(T + 2, cards.raw_len)}
    assert (hubs[0].done, hubs[1].done) == (4, 2)
    full = store.list_hubs(uid, payloads=True)
    assert full[0].parts["main"].gz == main.gz
    before = adapter.counts()
    assert store.list_hubs("nobody-" + uid) == []
    assert reads_of(adapter, before) == 1  # an empty query is still a read


def test_delete_user_and_tombstone(adapter: Adapter, uid: str) -> None:
    store = adapter.store
    other = uid + "b"
    store.upsert_user(UserRecord(uid, "me@example.com", last_login_at=AT), touch_login=True)
    for hub in ("ai103", "dsa-l1", "ai901"):
        store.put_parts(uid, hub, {"main": part(T)}, NOW_MS)
    store.put_parts(other, "ai103", {"main": part(T)}, NOW_MS)
    assert store.delete_user(uid) == 3
    assert store.get_user(uid) is None
    assert store.list_hubs(uid) == []
    assert store.delete_user(uid) == 0  # safe to repeat
    assert [h.hub for h in store.list_hubs(other)] == ["ai103"]  # nobody else's data
    h = tombstone_hash(uid)
    assert len(h) == 64
    store.put_tombstone(h, AT)
    store.put_tombstone(h, AT)  # idempotent
    assert store.is_tombstoned([h, tombstone_hash(other)]) == {h}
    assert store.is_tombstoned([]) == set()


# -- jobs ---------------------------------------------------------------------------------------


def job(now_ms: int, state: str = "scheduled") -> dict[str, Any]:
    return {
        "id": new_job_id(now_ms),
        "createdAt": datetime.fromtimestamp(now_ms / 1000, UTC).isoformat(timespec="milliseconds"),
        "kind": "maintenance",
        "state": state,
        "mode": "read_only",
        "startAt": "2026-10-13T18:30:00Z",
        "durationMin": 30,
        "message": "Upgrade",
    }


def test_jobs_round_trip_and_listing(adapter: Adapter) -> None:
    store = adapter.store
    a, b, c = job(T + 1), job(T + 2, "succeeded"), job(T + 3)
    for j in (a, b, c):
        store.put_job(j)
    assert store.get_job(a["id"]) == a
    assert store.get_job("j-missing") is None
    mine = {a["id"], b["id"], c["id"]}
    active = [j["id"] for j in store.list_jobs({"scheduled", "running"}, limit=500) if j["id"] in mine]
    assert active == [a["id"], c["id"]]  # oldest first
    newest = [j["id"] for j in store.list_jobs(limit=500) if j["id"] in mine]
    assert newest == [c["id"], b["id"], a["id"]]
    store.put_job({**a, "state": "cancelled"})
    assert store.get_job(a["id"])["state"] == "cancelled"  # type: ignore[index]


def test_claim_job_is_exclusive(adapter: Adapter) -> None:
    store = adapter.store
    j = job(T + 10)
    store.put_job(j)
    results: list[bool] = []
    errors: list[BaseException] = []
    lock = threading.Lock()

    def claim(n: int) -> None:
        try:
            got = store.claim_job(j["id"], f"holder-{n}", {"scheduled"})
        except Unavailable:  # emulator contention: the scheduler retries on its next tick
            got = False
        except BaseException as exc:
            errors.append(exc)
            return
        with lock:
            results.append(got)

    threads = [threading.Thread(target=claim, args=(n,)) for n in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert not errors, errors
    assert results.count(True) == 1
    stored = store.get_job(j["id"])
    assert stored is not None
    assert stored["state"] == "running"
    assert stored["holder"].startswith("holder-")
    assert stored["claimedAt"].endswith("Z")
    assert store.claim_job(j["id"], "late", {"scheduled"}) is False
    assert store.claim_job("j-missing", "x", {"scheduled"}) is False
    assert store.claim_job(j["id"], "ender", {"running"}, to_state="succeeded") is True
    assert store.claim_job(j["id"], "ender-2", {"running"}, to_state="succeeded") is False  # once
    done = store.get_job(j["id"])
    assert done is not None
    assert (done["state"], done["holder"]) == ("succeeded", "ender")


def test_jobs_list_billing(fresh: Adapter) -> None:
    for i in range(3):
        fresh.store.put_job(job(T + i))
    before = fresh.counts()
    assert len(fresh.store.list_jobs({"scheduled"})) == 3
    assert reads_of(fresh, before) == 3
    before = fresh.counts()
    assert fresh.store.list_jobs({"running"}) == []
    assert reads_of(fresh, before) == 1
