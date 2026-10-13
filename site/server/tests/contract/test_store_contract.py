"""The store contract, identical for every adapter (build-contracts.md section 11)."""

from __future__ import annotations

import gzip
import json
import random
import threading
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.store.base import Conflict, PartIn, PartOut, PartResult, Unavailable, UserRecord, progress_doc_id
from tests.contract.conftest import Adapter

T = 1_790_000_000_000
NOW_MS = T + 3_600_000


def part(upd: int, data: Any = None, done: int | None = None) -> PartIn:
    payload = {"upd": upd, "data": data if data is not None else {"x": upd}}
    raw = json.dumps(payload, separators=(",", ":")).encode()
    return PartIn(upd=upd, gz=gzip.compress(raw, mtime=0), raw_len=len(raw), done=done)


def payload(out: PartOut) -> Any:
    assert out.gz is not None
    return json.loads(gzip.decompress(out.gz))


def raw_doc(adapter: Adapter, uid: str, hub: str) -> dict[str, Any] | None:
    """The stored document as the backend holds it (bypasses the adapter's API and counters)."""
    if adapter.kind == "memory":
        doc = adapter.store._progress.get(progress_doc_id(uid, hub))  # type: ignore[attr-defined]
        if doc is None:
            return None
        out: dict[str, Any] = {"uid": doc.uid, "hub": doc.hub, "done": doc.done}
        for name, stored in doc.parts.items():
            out[f"u_{name}"], out[f"p_{name}"], out[f"n_{name}"] = stored.upd, stored.gz, stored.raw_len
        return out
    snap = adapter.store.db.collection("progress").document(progress_doc_id(uid, hub)).get()  # type: ignore[attr-defined]
    return snap.to_dict() if snap.exists else None


# -- progress ------------------------------------------------------------------------------


def test_round_trip(adapter: Adapter, uid: str) -> None:
    store = adapter.store
    parts = {"main": part(T + 1, {"S": "é ✓"}, done=4), "mocks": part(T + 2), "cards": part(T + 3)}
    results = store.put_parts(uid, "ai103", parts, NOW_MS)
    assert results == {
        "main": PartResult("accepted", T + 1),
        "mocks": PartResult("accepted", T + 2),
        "cards": PartResult("accepted", T + 3),
    }
    got = store.get_hub(uid, "ai103", {})
    assert set(got) == {"main", "mocks", "cards"}
    for name, sent in parts.items():
        assert got[name].upd == sent.upd
        assert got[name].gz == sent.gz  # bytes stored exactly as sent
    assert payload(got["main"])["data"] == {"S": "é ✓"}
    assert store.get_hub(uid, "ai901", {}) == {}
    assert store.get_hub("someone-else-" + uid, "ai103", {}) == {}


def test_data_model(adapter: Adapter, uid: str) -> None:
    adapter.store.put_parts(uid, "ai103", {"main": part(T, done=3), "cards": part(T + 5)}, NOW_MS)
    doc = raw_doc(adapter, uid, "ai103")
    assert doc is not None
    assert (doc["uid"], doc["hub"], doc["done"]) == (uid, "ai103", 3)
    assert (doc["u_main"], doc["u_cards"]) == (T, T + 5)
    assert isinstance(doc["p_main"], bytes)
    assert gzip.decompress(doc["p_main"]).startswith(b'{"upd":')
    assert doc["n_main"] == len(gzip.decompress(doc["p_main"]))
    assert "u_mocks" not in doc
    if adapter.kind == "firestore":
        assert isinstance(doc["t"], datetime)  # server timestamp


def test_partial_merge_keeps_other_parts(adapter: Adapter, uid: str) -> None:
    store = adapter.store
    main = part(T, done=2)
    store.put_parts(uid, "ai103", {"main": main, "mocks": part(T)}, NOW_MS)
    store.put_parts(uid, "ai103", {"cards": part(T + 9)}, NOW_MS)
    got = store.get_hub(uid, "ai103", {})
    assert {name: out.upd for name, out in got.items()} == {"main": T, "mocks": T, "cards": T + 9}
    assert got["main"].gz == main.gz
    doc = raw_doc(adapter, uid, "ai103")
    assert doc is not None
    assert doc["done"] == 2  # a write without main leaves done alone
    store.put_parts(uid, "ai103", {"main": part(T + 1, done=5)}, NOW_MS)
    doc = raw_doc(adapter, uid, "ai103")
    assert doc is not None
    assert doc["done"] == 5


def test_known_gives_stubs(adapter: Adapter, uid: str) -> None:
    store = adapter.store
    store.put_parts(uid, "ai103", {"main": part(T + 1), "mocks": part(T + 2)}, NOW_MS)
    got = store.get_hub(uid, "ai103", {"main": T + 1, "mocks": T + 2, "cards": 0})
    assert got == {"main": PartOut(T + 1, None), "mocks": PartOut(T + 2, None)}
    assert got["main"].is_stub
    got = store.get_hub(uid, "ai103", {"main": T, "mocks": T + 5})
    assert got["main"].gz is not None
    assert payload(got["main"])["upd"] == T + 1
    assert got["mocks"] == PartOut(T + 2, None)  # known is newer than stored: still a stub


def test_accepted_duplicate_stale(adapter: Adapter, uid: str) -> None:
    store = adapter.store
    store.put_parts(uid, "ai103", {"main": part(T), "mocks": part(T)}, NOW_MS)
    results = store.put_parts(
        uid, "ai103", {"main": part(T, {"other": 1}), "mocks": part(T - 1), "cards": part(T)}, NOW_MS
    )
    assert results == {
        "main": PartResult("duplicate", T),
        "mocks": PartResult("stale", T),
        "cards": PartResult("accepted", T),
    }
    got = store.get_hub(uid, "ai103", {})
    assert payload(got["main"])["data"] == {"x": T}  # the duplicate did not overwrite
    assert payload(got["mocks"])["upd"] == T


def test_legacy_part(adapter: Adapter, uid: str) -> None:
    store = adapter.store
    store.put_parts(uid, "ai901", {"legacy": part(T, done=7)}, NOW_MS)
    assert store.get_hub(uid, "ai901", {"legacy": T}) == {"legacy": PartOut(T, None)}
    doc = raw_doc(adapter, uid, "ai901")
    assert doc is not None
    assert doc["done"] == 7


# -- billing -------------------------------------------------------------------------------


def _delta(adapter: Adapter, before: tuple[int, int], wire_before: tuple[int, int]) -> tuple[Any, Any]:
    now, wire = adapter.counts(), adapter.wire_counts()
    return (now[0] - before[0], now[1] - before[1]), (wire[0] - wire_before[0], wire[1] - wire_before[1])


@pytest.mark.parametrize(
    ("operation", "expected"),
    [
        ("sync 3 parts of one hub", (1, 1)),
        ("sync duplicates", (1, 0)),
        ("GET unchanged", (1, 0)),
        ("GET changed", (2, 0)),
        ("GET nothing known", (1, 0)),
        ("GET missing doc", (1, 0)),
    ],
)
def test_billing_per_operation(adapter: Adapter, uid: str, operation: str, expected: tuple[int, int]) -> None:
    store = adapter.store
    parts = {"main": part(T + 1), "mocks": part(T + 2), "cards": part(T + 3)}
    if operation != "sync 3 parts of one hub":
        store.put_parts(uid, "ai103", parts, NOW_MS)
    before, wire_before = adapter.counts(), adapter.wire_counts()
    if operation.startswith("sync"):
        store.put_parts(uid, "ai103", parts, NOW_MS)
    elif operation == "GET unchanged":
        store.get_hub(uid, "ai103", {"main": T + 1, "mocks": T + 2, "cards": T + 3})
    elif operation == "GET changed":
        store.get_hub(uid, "ai103", {"main": T, "mocks": T + 2, "cards": T + 3})
    elif operation == "GET nothing known":
        store.get_hub(uid, "ai103", {"main": 0})
    else:
        store.get_hub("nobody-" + uid, "ai103", {"main": T})
    counted, wire = _delta(adapter, before, wire_before)
    assert counted == expected
    assert wire == expected  # the wire agrees with what the meter is told


# -- concurrency ----------------------------------------------------------------------------


def test_concurrent_put_parts_never_lands_an_older_write(adapter: Adapter, uid: str) -> None:
    store = adapter.store
    per_thread = 500 if adapter.kind == "memory" else 40
    errors: list[BaseException] = []
    observed: list[int] = []
    stop = threading.Event()
    sent_max: dict[str, int] = {}

    def writer(offset: int, seed: int) -> None:
        rng = random.Random(seed)
        top = 0
        stamps = [T + 2 * i + offset for i in range(per_thread)]
        rng.shuffle(stamps)  # out-of-order arrivals, like beacons racing a flush
        for upd in stamps:
            try:
                result = store.put_parts(uid, "ai103", {"main": part(upd)}, NOW_MS)["main"]
            except Unavailable:  # contention on the emulator; the client would retry
                continue
            except BaseException as exc:
                errors.append(exc)
                return
            top = max(top, upd)
            ok = (result.status == "accepted" and result.upd == upd) or (
                result.status == "stale" and result.upd > upd  # unique stamps: never a duplicate
            )
            if not ok:
                errors.append(AssertionError(f"put {upd} -> {result}"))
        sent_max[str(offset)] = top

    def observer() -> None:
        last = 0
        while not stop.is_set():
            try:
                got = store.get_hub(uid, "ai103", {})
            except Unavailable:
                continue
            except BaseException as exc:
                errors.append(exc)
                return
            if "main" in got:
                upd = got["main"].upd
                if upd < last:
                    errors.append(AssertionError(f"stored stamp went back from {last} to {upd}"))
                if payload(got["main"])["upd"] != upd:
                    errors.append(AssertionError("payload and stamp are torn"))
                last = upd
                observed.append(upd)

    threads = [threading.Thread(target=writer, args=(0, 1)), threading.Thread(target=writer, args=(1, 2))]
    watch = threading.Thread(target=observer)
    watch.start()
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    stop.set()
    watch.join()
    assert not errors, errors
    final = store.get_hub(uid, "ai103", {})["main"]
    assert final.upd == max(sent_max.values())  # the newest stamp any writer got stored
    assert payload(final)["upd"] == final.upd
    assert observed == sorted(observed)


def test_concurrent_different_parts_merge(adapter: Adapter, uid: str) -> None:
    store = adapter.store
    # The emulator locks pessimistically and resolves a deadlock only by a ~6 s lock
    # timeout (production Firestore aborts the younger transaction at once), so keep
    # its rounds few.
    rounds = 100 if adapter.kind == "memory" else 2

    errors: list[BaseException] = []

    def writer(name: str) -> None:
        try:
            for i in range(rounds + 1):
                for _attempt in range(10):  # a client retries after contention
                    try:
                        store.put_parts(uid, "ai103", {name: part(T + i)}, NOW_MS)
                        break
                    except Unavailable:
                        continue
        except BaseException as exc:
            errors.append(exc)

    threads = [threading.Thread(target=writer, args=(name,)) for name in ("main", "mocks", "cards")]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert not errors, errors
    got = store.get_hub(uid, "ai103", {})
    assert {name: out.upd for name, out in got.items()} == dict.fromkeys(
        ("main", "mocks", "cards"), T + rounds
    )


# -- users, usage, settings ------------------------------------------------------------------


def test_users(adapter: Adapter, uid: str) -> None:
    store = adapter.store
    count = store.count_users()
    first = datetime(2026, 10, 12, 8, tzinfo=UTC)
    record = UserRecord(uid, "a@example.com", True, "A", None, "google.com", last_login_at=first)
    store.upsert_user(record, touch_login=True)
    got = store.get_user(uid)
    assert got is not None
    assert (got.email, got.email_verified, got.name, got.provider) == (
        "a@example.com",
        True,
        "A",
        "google.com",
    )
    assert got.created_at == first
    assert got.last_login_at == first
    assert store.count_users() == count + 1

    # Within 24 h: no lastLoginAt change, and no write when nothing else changed.
    writes = adapter.counts()[1]
    store.upsert_user(
        UserRecord(
            uid, "a@example.com", True, "A", None, "google.com", last_login_at=first + timedelta(hours=5)
        ),
        touch_login=True,
    )
    assert adapter.counts()[1] == writes
    got = store.get_user(uid)
    assert got is not None
    assert got.last_login_at == first

    # A profile change is written; lastLoginAt only after 24 h.
    store.upsert_user(
        UserRecord(
            uid, "a@example.com", True, "Ann", None, "google.com", last_login_at=first + timedelta(hours=6)
        ),
        touch_login=True,
    )
    got = store.get_user(uid)
    assert got is not None
    assert (got.name, got.last_login_at) == ("Ann", first)
    store.upsert_user(
        UserRecord(
            uid, "a@example.com", True, "Ann", None, "google.com", last_login_at=first + timedelta(hours=24)
        ),
        touch_login=True,
    )
    got = store.get_user(uid)
    assert got is not None
    assert got.last_login_at == first + timedelta(hours=24)
    assert got.created_at == first
    assert store.count_users() == count + 1
    assert store.get_user("missing-" + uid) is None


def test_usage_increments(adapter: Adapter) -> None:
    store = adapter.store
    day = "t-" + uuid.uuid4().hex[:8]
    store.add_usage(day, {"reads": 3, "writes": 2})
    store.add_usage(day, {"reads": 1, "appEgress": 100})
    before = adapter.counts()
    got = store.get_usage([day, "missing-" + day])
    assert got == {day: {"reads": 4, "writes": 2, "appEgress": 100}}
    assert adapter.counts()[0] - before[0] == 2  # one read per key, found or not


def test_concurrent_usage_increments(adapter: Adapter) -> None:
    store = adapter.store
    day = "c-" + uuid.uuid4().hex[:8]
    n = 50 if adapter.kind == "memory" else 10

    def bump() -> None:
        for _ in range(n):
            store.add_usage(day, {"writes": 1})

    threads = [threading.Thread(target=bump) for _ in range(3)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert store.get_usage([day])[day]["writes"] == 3 * n


def test_settings_optimistic_version(adapter: Adapter) -> None:
    store = adapter.store
    key = "s-" + uuid.uuid4().hex[:8]
    assert store.get_setting(key) is None
    assert store.put_setting(key, {"tz": "Asia/Kolkata"}, expect_version=0) == 1
    assert store.get_setting(key) == ({"tz": "Asia/Kolkata"}, 1)
    with pytest.raises(Conflict):
        store.put_setting(key, {"tz": "UTC"}, expect_version=0)
    assert store.put_setting(key, {"tz": "UTC", "notice": "hi"}, expect_version=1) == 2
    with pytest.raises(Conflict):
        store.put_setting(key, {"tz": "x"}, expect_version=1)
    assert store.put_setting(key, {"tz": "y"}, expect_version=None) == 3  # unconditional
    assert store.get_setting(key) == ({"tz": "y"}, 3)  # a put replaces the whole value


def test_ping_and_later_methods(adapter: Adapter, uid: str) -> None:
    store = adapter.store
    store.ping()
    assert store.kind == adapter.kind
    for call in (
        lambda: store.restore_batch([], mode="merge", job_id="j", checkpoint={}),
        lambda: store.wipe_for_replace("j"),
    ):
        with pytest.raises(NotImplementedError, match="M3"):
            call()
