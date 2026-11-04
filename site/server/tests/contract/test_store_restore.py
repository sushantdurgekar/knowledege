"""The M3 store contract (build-contracts.md sections 24 and 26): `restore_batch` applies a
batch and its job checkpoint atomically and exactly once, newest-wins in merge mode;
`replace` stages rows and swaps them in at once (Postgres, memory); `update_job` is a
compare-and-set; `restore_lookup` reports what the target already holds."""

from __future__ import annotations

import gzip
import json
from datetime import UTC, datetime
from typing import Any

import pytest

from app.store.base import (
    Conflict,
    JobLost,
    PartIn,
    RestoreItem,
    Tombstone,
    Unavailable,
    Unsupported,
    UserRecord,
    empty_counts,
    new_job_id,
)
from tests.contract.conftest import Adapter

T = 1_790_000_000_000
NOW_MS = T + 3_600_000
AT = datetime(2026, 10, 12, 9, 30, tzinfo=UTC)
HOLDER = "runner-1"


def part(upd: int, data: Any = None, done: int | None = None) -> PartIn:
    raw = json.dumps({"upd": upd, "data": data if data is not None else {"x": upd}}, separators=(",", ":"))
    blob = raw.encode()
    return PartIn(upd=upd, gz=gzip.compress(blob, mtime=0), raw_len=len(blob), done=done)


def running_job(adapter: Adapter, mode: str = "merge") -> str:
    job_id = new_job_id(NOW_MS)
    adapter.store.put_job(
        {
            "id": job_id,
            "kind": "restore",
            "state": "running",
            "holder": HOLDER,
            "mode": mode,
            "createdAt": "2026-10-13T00:00:00.000Z",
            "checkpoint": {"line": 0},
        }
    )
    return job_id


def cp(start: int, end: int, **totals: Any) -> dict[str, Any]:
    return {
        "from": start,
        "line": end,
        "written": empty_counts(),
        "kept": empty_counts(),
        "skipped": empty_counts(),
        **totals,
    }


def user_item(line: int, uid: str, email: str = "x@example.com") -> RestoreItem:
    record = UserRecord(uid, email, True, "N", None, "google.com", created_at=AT, last_login_at=AT)
    return RestoreItem("user", line, uid=uid, user=record)


def progress_item(line: int, uid: str, hub: str, name: str, p: PartIn) -> RestoreItem:
    return RestoreItem("progress", line, uid=uid, hub=hub, part=name, data=p)


def test_merge_is_newest_wins_and_reports_counts(adapter: Adapter, uid: str) -> None:
    store = adapter.store
    store.upsert_user(UserRecord(uid, "live@example.com", last_login_at=AT), touch_login=True)
    store.put_parts(uid, "ai103", {"main": part(T + 5, done=1), "mocks": part(T)}, NOW_MS)
    other = uid + "n"
    stone = Tombstone("f" * 63 + uid[-1], AT)
    items = [
        RestoreItem("tombstone", 1, tombstone=stone),
        user_item(2, uid, "old@example.com"),  # exists: kept
        user_item(3, other),  # new
        progress_item(4, uid, "ai103", "main", part(T + 1, done=9)),  # older: kept
        progress_item(5, uid, "ai103", "mocks", part(T)),  # identical stamp: kept
        progress_item(6, uid, "ai103", "cards", part(T + 2)),  # new part
        progress_item(7, other, "ai901", "legacy", part(T + 3, done=4)),  # new doc
    ]
    job_id = running_job(adapter)
    result = store.restore_batch(items, mode="merge", job_id=job_id, checkpoint=cp(1, 7), holder=HOLDER)
    assert result.applied
    assert result.written == {"settings": 0, "tombstone": 1, "user": 1, "progress": 2}
    assert result.kept == {"settings": 0, "tombstone": 0, "user": 1, "progress": 2}
    assert result.checkpoint["line"] == 7
    assert result.checkpoint["written"]["progress"] == 2
    stored = store.get_job(job_id)
    assert stored is not None
    assert stored["checkpoint"] == result.checkpoint  # stored with the batch
    live = store.get_user(uid)
    assert live is not None
    assert live.email == "live@example.com"  # an existing user is kept
    new = store.get_user(other)
    assert new is not None
    assert (new.email, new.created_at, new.last_login_at) == ("x@example.com", AT, AT)
    got = store.get_hub(uid, "ai103", {})
    assert {p: o.upd for p, o in got.items()} == {"main": T + 5, "mocks": T, "cards": T + 2}
    assert [(h.hub, h.done) for h in store.list_hubs(other)] == [("ai901", 4)]
    assert store.is_tombstoned([stone.h]) == {stone.h}


def test_batches_apply_exactly_once(adapter: Adapter, uid: str) -> None:
    store = adapter.store
    job_id = running_job(adapter)
    first = [user_item(1, uid), progress_item(2, uid, "ai103", "main", part(T))]
    done = store.restore_batch(first, mode="merge", job_id=job_id, checkpoint=cp(1, 2), holder=HOLDER)
    assert done.applied
    again = store.restore_batch(first, mode="merge", job_id=job_id, checkpoint=cp(1, 2), holder=HOLDER)
    assert not again.applied  # a retry after a lost reply changes nothing
    assert again.checkpoint == done.checkpoint
    with pytest.raises(Conflict):  # a gap: lines 3-4 were never applied
        store.restore_batch([], mode="merge", job_id=job_id, checkpoint=cp(5, 6), holder=HOLDER)
    with pytest.raises(JobLost):  # someone else holds the job now
        store.restore_batch([], mode="merge", job_id=job_id, checkpoint=cp(3, 4), holder="zombie")
    second = [progress_item(3, uid, "ai103", "cards", part(T + 1))]
    totals = {k: done.checkpoint[k] for k in ("written", "kept", "skipped")}
    result = store.restore_batch(
        second, mode="merge", job_id=job_id, checkpoint=cp(3, 3, **totals), holder=HOLDER
    )
    assert result.applied
    assert result.checkpoint["written"] == {"settings": 0, "tombstone": 0, "user": 1, "progress": 2}
    assert store.claim_job(job_id, HOLDER, {"running"}, to_state="cancelled")
    with pytest.raises(JobLost):  # not running any more
        store.restore_batch([], mode="merge", job_id=job_id, checkpoint=cp(4, 4), holder=HOLDER)


def test_a_failed_batch_applies_nothing(adapter: Adapter, uid: str) -> None:
    if adapter.kind == "firestore":
        pytest.skip("no fault hook on Firestore: a WriteBatch commit is atomic by design")
    store = adapter.store
    job_id = running_job(adapter)
    items = [user_item(1, uid), progress_item(2, uid, "ai103", "main", part(T))]
    # Postgres raises it inside the transaction, after the records, before the checkpoint.
    store.fail_next("restore_batch", Unavailable("crash mid-batch"))  # type: ignore[attr-defined]
    with pytest.raises(Unavailable, match="mid-batch"):
        store.restore_batch(items, mode="merge", job_id=job_id, checkpoint=cp(1, 2), holder=HOLDER)
    assert store.get_user(uid) is None
    assert store.get_hub(uid, "ai103", {}) == {}
    stored = store.get_job(job_id)
    assert stored is not None
    assert stored["checkpoint"] == {"line": 0}
    result = store.restore_batch(items, mode="merge", job_id=job_id, checkpoint=cp(1, 2), holder=HOLDER)
    assert result.applied
    assert result.written["user"] == result.written["progress"] == 1


def test_replace_swaps_everything_at_once(fresh: Adapter) -> None:
    store = fresh.store
    if fresh.kind == "firestore":
        job_id = running_job(fresh, "replace")
        with pytest.raises(Unsupported):
            store.restore_batch([], mode="replace", job_id=job_id, checkpoint=cp(1, 1), holder=HOLDER)
        with pytest.raises(Unsupported):
            store.swap_replace(job_id, holder=HOLDER, expected={}, checkpoint={})
        return
    store.upsert_user(UserRecord("old-user", "old@example.com", last_login_at=AT), touch_login=True)
    store.put_parts("old-user", "ai103", {"main": part(T)}, NOW_MS)
    store.put_parts("keep", "ai103", {"main": part(T + 50)}, NOW_MS)  # replaced too
    job_id = running_job(fresh, "replace")
    items = [
        user_item(1, "keep"),
        user_item(2, "new-user"),
        progress_item(3, "keep", "ai103", "main", part(T + 1, done=2)),
        progress_item(4, "keep", "ai103", "cards", part(T + 2)),
        progress_item(5, "new-user", "dsa-l1", "main", part(T + 3, done=5)),
    ]
    staged = store.restore_batch(items[:3], mode="replace", job_id=job_id, checkpoint=cp(1, 3), holder=HOLDER)
    assert staged.applied
    assert store.get_user("new-user") is None  # nothing visible before the swap
    assert store.get_hub("keep", "ai103", {})["main"].upd == T + 50
    totals = {k: staged.checkpoint[k] for k in ("written", "kept", "skipped")}
    store.restore_batch(
        items[3:], mode="replace", job_id=job_id, checkpoint=cp(4, 5, **totals), holder=HOLDER
    )
    with pytest.raises(Conflict):  # counts must match what was staged
        store.swap_replace(job_id, holder=HOLDER, expected={"user": 2, "progress": 4}, checkpoint={})
    swapped = store.swap_replace(
        job_id, holder=HOLDER, expected={"user": 2, "progress": 3}, checkpoint={"line": 5, "phase": "swapped"}
    )
    assert swapped.applied
    again = store.swap_replace(
        job_id, holder=HOLDER, expected={"user": 2, "progress": 3}, checkpoint={"line": 5, "phase": "swapped"}
    )
    assert not again.applied  # once
    assert sorted(u.uid for u in store.iter_users()) == ["keep", "new-user"]
    assert store.get_user("old-user") is None
    assert store.list_hubs("old-user") == []
    hubs = store.list_hubs("keep")
    assert [(h.hub, sorted(h.parts), h.done) for h in hubs] == [("ai103", ["cards", "main"], 2)]
    assert hubs[0].parts["main"].upd == T + 1  # replace: the backup's value, even if older
    assert [(h.hub, h.done) for h in store.list_hubs("new-user")] == [("dsa-l1", 5)]
    store.wipe_for_replace(job_id)  # nothing left to wipe: safe


def test_update_job_is_compare_and_set(adapter: Adapter) -> None:
    store = adapter.store
    job_id = running_job(adapter)
    assert store.update_job(job_id, {"heartbeat": "2026-10-13T00:00:20Z"}, expect={"holder": HOLDER})
    assert not store.update_job(job_id, {"heartbeat": "x"}, expect={"holder": "other"})
    stale = {"holder": HOLDER, "heartbeat": "2026-10-13T00:00:20Z", "state": "running"}
    assert store.update_job(job_id, {"holder": "runner-2"}, expect=stale)  # a reclaim
    assert not store.update_job(job_id, {"holder": "runner-3"}, expect=stale)  # only once
    assert store.update_job(job_id, {"note": None}, expect={"missing": None})  # missing == None
    stored = store.get_job(job_id)
    assert stored is not None
    assert (stored["holder"], stored["heartbeat"], stored["state"]) == (
        "runner-2",
        "2026-10-13T00:00:20Z",
        "running",
    )
    assert not store.update_job("j0000000000000-00000000", {"x": 1}, expect={})


def test_restore_lookup(adapter: Adapter, uid: str) -> None:
    store = adapter.store
    store.upsert_user(UserRecord(uid, "a@example.com", last_login_at=AT), touch_login=True)
    store.put_parts(uid, "ai103", {"main": part(T), "cards": part(T + 1)}, NOW_MS)
    existing, stamps = store.restore_lookup([uid, uid + "x"], [(uid, "ai103"), (uid, "ai901")])
    assert existing == {uid}
    assert stamps == {(uid, "ai103"): {"main": T, "cards": T + 1}}


def test_merge_never_overwrites_a_write_that_lands_mid_batch(adapter: Adapter, uid: str) -> None:
    """Firestore prepares a batch from reads, then commits it: a user's write (or sign-in)
    landing in between must not be overwritten by the older backup data. The batch is
    refused (Conflict: the runner re-reads and retries) and a retry keeps the newer data.
    Postgres and memory decide under a row lock or the store lock, so no gap exists."""
    if adapter.kind != "firestore":
        pytest.skip("Postgres and memory decide and write under one lock")
    store = adapter.store
    store.put_parts(uid, "ai103", {"main": part(T)}, NOW_MS)
    other = uid + "n"
    original = store._get_all  # type: ignore[attr-defined]
    landed: list[str] = []

    def racing_get_all(refs: list[Any], fields: list[str]) -> list[Any]:
        snaps = original(refs, fields)
        if fields == ["createdAt"] and "user" not in landed:
            landed.append("user")  # the user signs up between the read and the commit
            store.upsert_user(UserRecord(other, "live@example.com", last_login_at=AT), touch_login=True)
        if fields[:1] == ["u_main"] and "progress" not in landed:
            landed.append("progress")  # the learner syncs a newer part meanwhile
            store.put_parts(uid, "ai103", {"main": part(T + 50)}, NOW_MS)
        return list(snaps)

    store._get_all = racing_get_all  # type: ignore[attr-defined]
    job_id = running_job(adapter)
    items = [
        user_item(1, other, "old@example.com"),
        progress_item(2, uid, "ai103", "main", part(T + 10)),  # newer than T, older than T + 50
    ]
    with pytest.raises(Conflict):
        store.restore_batch(items, mode="merge", job_id=job_id, checkpoint=cp(1, 2), holder=HOLDER)
    assert landed == ["user", "progress"]
    assert {p: o.upd for p, o in store.get_hub(uid, "ai103", {}).items()} == {"main": T + 50}
    live = store.get_user(other)
    assert live is not None
    assert live.email == "live@example.com"
    stored = store.get_job(job_id)
    assert stored is not None
    assert stored["checkpoint"] == {"line": 0}  # nothing of the batch applied
    retry = store.restore_batch(items, mode="merge", job_id=job_id, checkpoint=cp(1, 2), holder=HOLDER)
    assert retry.applied
    assert retry.kept == {"settings": 0, "tombstone": 0, "user": 1, "progress": 1}
    assert {p: o.upd for p, o in store.get_hub(uid, "ai103", {}).items()} == {"main": T + 50}
    live = store.get_user(other)
    assert live is not None
    assert live.email == "live@example.com"


def test_a_swap_that_fails_midway_leaves_the_old_data(fresh: Adapter) -> None:
    """Replace swaps in one transaction (Postgres) or under one lock (memory): a failure
    after the old rows are gone (Postgres: after TRUNCATE and the INSERTs) rolls back to
    the old data, the staged rows stay for a retry, and the retry swaps once."""
    if fresh.kind == "firestore":
        pytest.skip("replace is not supported on Firestore")
    store = fresh.store
    store.upsert_user(UserRecord("old-user", "old@example.com", last_login_at=AT), touch_login=True)
    store.put_parts("old-user", "ai103", {"main": part(T)}, NOW_MS)
    job_id = running_job(fresh, "replace")
    items = [user_item(1, "new-user"), progress_item(2, "new-user", "dsa-l1", "main", part(T + 3, done=5))]
    store.restore_batch(items, mode="replace", job_id=job_id, checkpoint=cp(1, 2), holder=HOLDER)
    store.fail_next("swap_replace", Unavailable("crash mid-swap"))  # type: ignore[attr-defined]
    final = {"line": 2, "phase": "swapped"}
    with pytest.raises(Unavailable, match="mid-swap"):
        store.swap_replace(job_id, holder=HOLDER, expected={"user": 1, "progress": 1}, checkpoint=final)
    assert [u.uid for u in store.iter_users()] == ["old-user"]
    assert [h.hub for h in store.list_hubs("old-user")] == ["ai103"]
    assert store.list_hubs("new-user") == []
    stored = store.get_job(job_id)
    assert stored is not None
    assert stored["checkpoint"]["line"] == 2
    assert stored["checkpoint"].get("phase") != "swapped"
    swapped = store.swap_replace(job_id, holder=HOLDER, expected={"user": 1, "progress": 1}, checkpoint=final)
    assert swapped.applied
    assert [u.uid for u in store.iter_users()] == ["new-user"]
    assert store.list_hubs("old-user") == []


def test_postgres_connection_lost_mid_batch_applies_nothing(fresh: Adapter, uid: str) -> None:
    """The server end of the connection is killed in the middle of a batch's transaction
    (pg_terminate_backend after the records, before the checkpoint): nothing of the batch
    is applied, the store answers Unavailable, the pool replaces the dead connection and
    the retried batch applies once."""
    if fresh.kind != "postgres":
        pytest.skip("Postgres only: a real connection loss")
    import psycopg

    from tests.contract.conftest import PG_URL

    store = fresh.store
    job_id = running_job(fresh)
    items = [user_item(1, uid), progress_item(2, uid, "ai103", "main", part(T))]

    def kill(conn: Any) -> None:
        pid = conn.info.backend_pid
        with psycopg.connect(PG_URL, autocommit=True) as admin:
            admin.execute("SELECT pg_terminate_backend(%s)", (pid,))

    store.fail_next("restore_batch", kill)  # type: ignore[attr-defined]
    with pytest.raises(Unavailable):
        store.restore_batch(items, mode="merge", job_id=job_id, checkpoint=cp(1, 2), holder=HOLDER)
    assert store.get_user(uid) is None
    assert store.get_hub(uid, "ai103", {}) == {}
    stored = store.get_job(job_id)
    assert stored is not None
    assert stored["checkpoint"] == {"line": 0}
    result = store.restore_batch(items, mode="merge", job_id=job_id, checkpoint=cp(1, 2), holder=HOLDER)
    assert result.applied
    assert result.written["user"] == result.written["progress"] == 1
    again = store.restore_batch(items, mode="merge", job_id=job_id, checkpoint=cp(1, 2), holder=HOLDER)
    assert not again.applied
