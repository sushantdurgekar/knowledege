"""Restore end to end on every store (build-contracts.md sections 24 and 26).

- S17: a backup taken from a memory-store instance (through the admin API) restores
  into a memory, Postgres or Firestore-emulator instance with a clean report and an
  identical decoded state.
- merge vs replace: merge keeps the target's newer parts and other users, replace
  leaves exactly the backup (Postgres, memory; Firestore refuses replace).
- quota pause/resume (Firestore emulator, a small injected write quota): the job pauses
  at the day's budget and resumes after the Pacific reset until it is done.
"""

from __future__ import annotations

import time
from datetime import datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.clock import FixedClock
from app.store.base import UserRecord, tombstone_hash
from app.store.memory import MemoryStore
from tests.api.conftest import NOW_MS, runtime
from tests.api.test_admin_api import ADMIN, session
from tests.contract.conftest import Adapter
from tests.restore_support import (
    API,
    AT,
    PASS,
    T,
    part,
    seed,
    start_job,
    state_of,
    upload,
    validate,
    wait_job,
)

DELETED = "u0004"  # tombstoned in the source while its data is still there (deleted mid-backup)


def wait_for_meter(client: TestClient) -> None:
    deadline = time.monotonic() + 10
    while runtime(client).meter.load_state == "pending" and time.monotonic() < deadline:
        time.sleep(0.01)


def backup_from_memory_instance(
    make_client: Any, tmp_path: Path, users: int = 25
) -> tuple[Path, dict[str, Any]]:
    """A backup downloaded from a memory-store app, and the state a restore must produce."""
    source = MemoryStore()
    seed(source, users)
    source.put_tombstone(tombstone_hash(DELETED), AT)
    client: TestClient = make_client(
        store=source, clock=FixedClock(NOW_MS), admin_emails=(ADMIN,), data_dir=tmp_path / "source"
    )
    session(client)
    created = client.post(
        "/api/admin/backups",
        json={"passphrase": PASS, "requireReadOnly": True, "confirm": "BACKUP"},
        headers=API,
    )
    assert created.status_code == 200, created.text
    download = client.get(f"/api/admin/backups/{created.json()['ticket']}")
    assert download.status_code == 200
    path = tmp_path / created.json()["filename"]
    path.write_bytes(download.content)
    expected = state_of(source)
    expected = {
        "users": [u for u in expected["users"] if u[0] != DELETED],
        "progress": [p for p in expected["progress"] if p[0] != DELETED],
        "hubs": [h for h in expected["hubs"] if h[0] != DELETED],
    }
    return path, expected


def target_client(make_client: Any, fresh: Adapter, tmp_path: Path, **kw: Any) -> TestClient:
    client: TestClient = make_client(
        store=fresh.store, clock=FixedClock(NOW_MS), admin_emails=(ADMIN,), data_dir=tmp_path / "target", **kw
    )
    wait_for_meter(client)
    session(client)
    runtime(client).restore.fs_rate = 100_000.0  # no pacing in tests
    return client


def test_s17_memory_backup_restores_identically(fresh: Adapter, make_client: Any, tmp_path: Path) -> None:
    path, expected = backup_from_memory_instance(make_client, tmp_path)
    client = target_client(make_client, fresh, tmp_path)
    rt = runtime(client)
    upload_id = upload(client, path)
    info = validate(client, upload_id, PASS)
    assert info["state"] == "validated", info
    report = info["report"]
    assert report["header"]["source"]["store"] == "memory"
    assert report["target"]["users"] == 0
    assert report["plan"]["users"] == {"new": 24, "existing": 0}
    assert report["plan"]["skipped"]["tombstonedInBackup"] == {"user": 1, "progress": 3}
    if fresh.kind == "firestore":
        assert report["modes"] == ["merge"]
        assert report["plan"]["estWrites"] >= 24 + 24 + 8
        assert report["plan"]["fitsToday"] is True
    created = start_job(client, upload_id)
    assert created.status_code == 201, created.text
    done = wait_job(client, created.json()["job"]["id"])
    assert done["state"] == "succeeded", done
    clean = done["report"]
    assert clean["ok"]
    assert clean["countsOk"]
    assert clean["sample"]["mismatched"] == 0
    assert clean["sample"]["checked"] >= 1
    assert clean["skipped"]["user"] == 1
    assert sum(clean["kept"].values()) == 1  # only the settings record (merge keeps the target's)
    assert state_of(fresh.store) == expected
    assert rt.maintenance_mode == "off"


@pytest.mark.parametrize("mode", ["merge", "replace"])
def test_merge_vs_replace(fresh: Adapter, make_client: Any, tmp_path: Path, mode: str) -> None:
    path, expected = backup_from_memory_instance(make_client, tmp_path, users=9)
    store = fresh.store
    store.upsert_user(UserRecord("other", "other@example.com", last_login_at=AT), touch_login=True)
    store.put_parts("other", "ai103", {"main": part("ai103", "main", T)}, NOW_MS)
    store.upsert_user(UserRecord("u0001", "live@example.com", last_login_at=AT), touch_login=True)
    store.put_parts("u0001", "ai103", {"main": part("ai103", "main", T + 500)}, NOW_MS)
    client = target_client(make_client, fresh, tmp_path)
    upload_id = upload(client, path)
    assert validate(client, upload_id, PASS)["state"] == "validated"
    confirm = "RESTORE" if mode == "merge" else "REPLACE 2 USERS"
    created = start_job(client, upload_id, mode=mode, confirm=confirm)
    if fresh.kind == "firestore" and mode == "replace":
        assert (created.status_code, created.json()["code"]) == (409, "unsupported")
        return
    assert created.status_code == 201, created.text
    done = wait_job(client, created.json()["job"]["id"])
    assert done["state"] == "succeeded", done
    got = state_of(store)
    if mode == "replace":
        assert got == expected
        return
    assert store.get_user("other") is not None  # merge leaves everyone else alone
    live = store.get_user("u0001")
    assert live is not None
    assert live.email == "live@example.com"
    assert store.get_hub("u0001", "ai103", {})["main"].upd == T + 500  # newer in the target: kept
    assert done["report"]["kept"]["progress"] == 1
    restored = [p for p in got["progress"] if p[:3] != ("u0001", "ai103", "main") and p[0] != "other"]
    assert restored == [p for p in expected["progress"] if p[:3] != ("u0001", "ai103", "main")]


def test_quota_pause_and_resume(fresh: Adapter, make_client: Any, tmp_path: Path) -> None:
    if fresh.kind != "firestore":
        pytest.skip("the write quota applies to Firestore targets")
    path, expected = backup_from_memory_instance(make_client, tmp_path, users=20)
    client = target_client(make_client, fresh, tmp_path, quota_writes=30, quota_reserve=0.0)
    rt = runtime(client)
    clock = rt.clock
    assert isinstance(clock, FixedClock)
    upload_id = upload(client, path)
    info = validate(client, upload_id, PASS)
    plan = info["report"]["plan"]
    assert plan["fitsToday"] is False
    assert plan["daysNeeded"] >= 2
    job = start_job(client, upload_id).json()["job"]
    pauses = 0
    while True:
        state = wait_job(client, job["id"], states={"paused_quota", "succeeded", "needs_attention", "failed"})
        if state["state"] != "paused_quota":
            break
        pauses += 1
        assert pauses < 10, state
        assert rt.maintenance_mode == "full"  # stays in maintenance while paused
        assert rt.meter.today()["writes"] <= 30 + 3  # the batch never overshoots the budget
        resume = datetime.fromisoformat(state["resumeAt"].replace("Z", "+00:00"))
        clock.set(int(resume.timestamp() * 1000))  # the next Pacific day, 5 min after the reset
        rt.scheduler.refresh()
        assert rt.scheduler.tick() == [f"resumed {job['id']}"]
    assert state["state"] == "succeeded", state
    assert pauses >= 1
    assert state["report"]["ok"]
    assert state_of(fresh.store) == expected
    assert rt.maintenance_mode == "off"


def test_a_firestore_backup_restores_identically_into_postgres(
    emulator_ready: bool, make_client: Any, tmp_path: Path
) -> None:
    """S17 across stores: a backup taken through the admin API of a Firestore-backed
    instance (emulator) restores into a Postgres instance with the same decoded state:
    users (timestamps included), every part's upd and JSON, and the hubs' done counts."""
    import uuid

    from tests.contract.conftest import _wipe_emulator, drop_schema, make_firestore, make_postgres

    if not emulator_ready:
        pytest.skip("FIRESTORE_EMULATOR_HOST is not set")
    project = "demo-fs2pg-" + uuid.uuid4().hex[:12]
    schema = "fresh_" + uuid.uuid4().hex[:12]
    source = make_firestore(project)
    target = make_postgres(schema)  # skips (or fails with REQUIRE_PG=1) without Postgres
    try:
        seed(source.store, 15)
        source.store.put_tombstone(tombstone_hash(DELETED), AT)
        expected = state_of(source.store)
        expected = {k: [row for row in rows if row[0] != DELETED] for k, rows in expected.items()}
        src: TestClient = make_client(
            store=source.store, clock=FixedClock(NOW_MS), admin_emails=(ADMIN,), data_dir=tmp_path / "source"
        )
        wait_for_meter(src)
        session(src)
        created = src.post(
            "/api/admin/backups",
            json={"passphrase": PASS, "requireReadOnly": True, "confirm": "BACKUP"},
            headers=API,
        )
        assert created.status_code == 200, created.text
        download = src.get(f"/api/admin/backups/{created.json()['ticket']}")
        assert download.status_code == 200
        path = tmp_path / created.json()["filename"]
        path.write_bytes(download.content)

        client = target_client(make_client, target, tmp_path)
        upload_id = upload(client, path)
        info = validate(client, upload_id, PASS)
        assert info["state"] == "validated", info
        assert info["report"]["header"]["source"]["store"] == "firestore"
        done = wait_job(client, start_job(client, upload_id).json()["job"]["id"])
        assert done["state"] == "succeeded", done
        assert done["report"]["ok"]
        assert done["report"]["sample"]["mismatched"] == 0
        assert state_of(target.store) == expected
    finally:
        source.store.close()
        target.store.close()
        _wipe_emulator(project)
        drop_schema(schema)
