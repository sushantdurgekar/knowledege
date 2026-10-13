"""The restore API on the memory store (build-contracts.md sections 24 and 26): uploads
(chunk idempotency, resume, sha mismatch), validation (the tamper matrix and a wrong
passphrase fail before any write), the plan, restore jobs (merge, replace, tombstone
skips, maintenance handling, cancel) and the destructive rules."""

from __future__ import annotations

import hashlib
import os
import struct
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.clock import FixedClock
from app.restore.uploads import CHUNK_SIZE
from app.store.base import UserRecord, tombstone_hash
from app.store.memory import MemoryStore
from tests.api.conftest import NOW_MS, runtime
from tests.api.test_admin_api import ADMIN, session
from tests.restore_support import (
    API,
    AT,
    PASS,
    T,
    part,
    put_chunk,
    seed,
    start_job,
    state_of,
    upload,
    validate,
    wait_job,
    write_backup,
)


@pytest.fixture
def source() -> MemoryStore:
    store = MemoryStore()
    seed(store, 12)
    return store


def admin_client(make_client: Any, tmp_path: Path, store: MemoryStore | None = None, **kw: Any) -> TestClient:
    client: TestClient = make_client(
        store=store or MemoryStore(),
        clock=FixedClock(NOW_MS),
        admin_emails=(ADMIN,),
        data_dir=tmp_path / "data",
        **kw,
    )
    session(client)
    return client


def store_of(client: TestClient) -> MemoryStore:
    store = runtime(client).store
    assert isinstance(store, MemoryStore)
    return store


# -- uploads ---------------------------------------------------------------------------------


def test_chunks_are_idempotent_resumable_and_checked(make_client: Any, tmp_path: Path) -> None:
    client = admin_client(make_client, tmp_path)
    data = os.urandom(2 * CHUNK_SIZE + 1000)
    body = {"name": "big.backup", "size": len(data), "lastModified": 1}
    created = client.post("/api/admin/restore/uploads", json=body, headers=API)
    assert created.status_code == 201, created.text
    info = created.json()
    upload_id = info["uploadId"]
    assert (info["chunkSize"], info["chunks"], info["received"], info["state"]) == (
        CHUNK_SIZE,
        3,
        [],
        "uploading",
    )
    chunks = [data[i * CHUNK_SIZE : (i + 1) * CHUNK_SIZE] for i in range(3)]

    assert put_chunk(client, upload_id, 2, chunks[2]).json()["received"] == [2]
    again = put_chunk(client, upload_id, 2, chunks[2])  # a retry: nothing changes
    assert (again.status_code, again.json()["received"]) == (200, [2])
    bad = put_chunk(client, upload_id, 0, chunks[0], sha="0" * 64)
    assert (bad.status_code, bad.json()["code"]) == (422, "checksum")
    short = put_chunk(client, upload_id, 0, chunks[0][:-1])
    assert short.status_code == 422  # every chunk but the last is exactly 4 MiB
    assert put_chunk(client, upload_id, 3, b"x").status_code == 422  # out of range
    huge = put_chunk(client, upload_id, 0, chunks[0] + b"x")
    assert huge.status_code == 413
    missing_sha = client.put(
        f"/api/admin/restore/uploads/{upload_id}/chunks/0", content=chunks[0], headers=API
    )
    assert missing_sha.status_code == 422

    # Resume after a "reload": the same file gets the same upload and what is missing.
    resumed = client.post("/api/admin/restore/uploads", json=body, headers=API)
    assert resumed.status_code == 200
    assert (resumed.json()["uploadId"], resumed.json()["received"]) == (upload_id, [2])
    other = client.post("/api/admin/restore/uploads", json={**body, "name": "other.backup"}, headers=API)
    assert (other.status_code, other.json()["code"]) == (409, "busy")  # one upload at a time

    put_chunk(client, upload_id, 0, chunks[0])
    done = put_chunk(client, upload_id, 1, chunks[1]).json()
    assert (done["state"], done["received"]) == ("assembled", [0, 1, 2])
    staged = tmp_path / "data" / "restore" / upload_id / "upload.part"
    assert hashlib.sha256(staged.read_bytes()).digest() == hashlib.sha256(data).digest()
    assert client.get(f"/api/admin/restore/uploads/{upload_id}").json()["state"] == "assembled"
    assert client.get("/api/admin/restore/uploads").json()["uploads"][0]["uploadId"] == upload_id

    assert client.delete(f"/api/admin/restore/uploads/{upload_id}", headers=API).status_code == 204
    assert not staged.parent.exists()
    assert client.get(f"/api/admin/restore/uploads/{upload_id}").status_code == 404
    assert client.get("/api/admin/restore/uploads/../../etc").status_code == 404


def test_upload_limits(make_client: Any, tmp_path: Path) -> None:
    client = admin_client(make_client, tmp_path, max_backup_bytes=2_000_000)
    too_big = client.post(
        "/api/admin/restore/uploads", json={"name": "x", "size": 2_000_001, "lastModified": 1}, headers=API
    )
    assert (too_big.status_code, too_big.json()["code"]) == (413, "too_large")
    for body in ({"name": "", "size": 100, "lastModified": 1}, {"name": "x", "size": "1", "lastModified": 1}):
        assert client.post("/api/admin/restore/uploads", json=body, headers=API).status_code == 422
    no_csrf = client.post("/api/admin/restore/uploads", json={"name": "x", "size": 100, "lastModified": 1})
    assert no_csrf.status_code == 403


def test_restore_routes_are_hidden_from_non_admins(make_client: Any, tmp_path: Path) -> None:
    client = admin_client(make_client, tmp_path)
    session(client, "someone", email="someone@example.com")
    for method, url in (
        ("get", "/api/admin/restore/uploads"),
        ("post", "/api/admin/restore/uploads"),
        ("get", "/api/admin/restore/uploads/u0123456789abcdef01234567"),
        ("put", "/api/admin/restore/uploads/u0123456789abcdef01234567/chunks/0"),
    ):
        response = getattr(client, method)(url, headers=API)
        assert (response.status_code, response.json()["code"]) == (404, "not_found"), url


# -- validation --------------------------------------------------------------------------------


def _frames(blob: bytes) -> tuple[int, list[tuple[int, int]]]:
    """(body offset, [(start, end)] of each frame) of an encrypted backup."""
    (header_len,) = struct.unpack(">I", blob[6:10])
    pos = start = 10 + header_len
    spans = []
    while pos < len(blob):
        (length,) = struct.unpack(">I", blob[pos : pos + 4])
        spans.append((pos, pos + 4 + length))
        pos += 4 + length
    return start, spans


def tampered(blob: bytes, how: str) -> bytes:
    start, spans = _frames(blob)
    if how == "flipped body byte":
        i = (start + len(blob)) // 2
        return blob[:i] + bytes([blob[i] ^ 0x01]) + blob[i + 1 :]
    if how == "flipped header byte":
        i = blob.index(b'"createdAt"') + 3
        return blob[:i] + bytes([blob[i] ^ 0x01]) + blob[i + 1 :]
    if how == "truncated":
        return blob[: len(blob) - 7]
    if how == "dropped last frame":
        return blob[: spans[-1][0]]
    if how == "reordered frames":
        (a0, a1), (b0, b1) = spans[0], spans[1]
        return blob[:a0] + blob[b0:b1] + blob[a0:a1] + blob[b1:]
    if how == "trailing bytes":
        return blob + b"\x00"
    raise AssertionError(how)


TAMPERS = [
    "flipped body byte",
    "flipped header byte",
    "truncated",
    "dropped last frame",
    "reordered frames",
    "trailing bytes",
]


@pytest.mark.parametrize("how", [*TAMPERS, "wrong passphrase", "no passphrase"])
def test_validation_rejects_tampering_before_any_write(make_client: Any, tmp_path: Path, how: str) -> None:
    source = MemoryStore()
    seed(source, 40)
    for i in range(40):  # incompressible filler: the gzip stream spans several 1 MiB frames
        source.put_parts(
            f"z{i:03d}", "ai103", {"main": part("ai103", "main", T, os.urandom(40_000).hex())}, NOW_MS
        )
    path = write_backup(source, tmp_path / "src.backup", passphrase=PASS)
    blob = path.read_bytes()
    assert len(_frames(blob)[1]) >= 2
    bad = tmp_path / "bad.backup"
    bad.write_bytes(blob if how in ("wrong passphrase", "no passphrase") else tampered(blob, how))
    target = MemoryStore()
    seed(target, 2, prefix="t")
    before = state_of(target)
    client = admin_client(make_client, tmp_path, store=target)
    writes = target.ops.snapshot().writes
    upload_id = upload(client, bad)
    passphrase = {"wrong passphrase": "not the passphrase", "no passphrase": None}.get(how, PASS)
    info = validate(client, upload_id, passphrase)
    assert info["state"] == "invalid", info
    assert info["error"]
    assert "report" not in info
    assert not (tmp_path / "data" / "restore" / upload_id / "ready.ndjson.gz").exists()
    assert state_of(target) == before
    assert target.ops.snapshot().writes == writes  # nothing written to the target
    job = start_job(client, upload_id)
    assert (job.status_code, job.json()["code"]) == (409, "not_validated")


@pytest.mark.parametrize("encrypted", [False, True], ids=["plain", "encrypted"])
def test_validate_reports_the_plan(
    make_client: Any, tmp_path: Path, source: MemoryStore, encrypted: bool
) -> None:
    # The backup: 12 users; u0000 also tombstoned in the backup (deleted mid-backup).
    source.put_tombstone(tombstone_hash("u0000"), AT)
    path = write_backup(source, tmp_path / "s.backup", passphrase=PASS if encrypted else None)
    # The target: u0001 exists with a newer main, u0002 has identical stamps, u0003 deleted there.
    target = MemoryStore()
    target.upsert_user(UserRecord("u0001", "live@example.com", last_login_at=AT), touch_login=True)
    target.put_parts("u0001", "ai103", {"main": part("ai103", "main", T + 999)}, NOW_MS)
    target.put_parts("u0002", "ai103", {"main": part("ai103", "main", T + 2)}, NOW_MS)
    target.put_tombstone(tombstone_hash("u0003"), AT)
    client = admin_client(make_client, tmp_path, store=target)
    upload_id = upload(client, path)
    info = validate(client, upload_id, PASS if encrypted else None)
    assert info["state"] == "validated", info
    report = info["report"]
    assert report["header"]["encrypted"] is encrypted
    assert report["header"]["source"]["store"] == "memory"
    progress_total = 12 * 3 + 4  # ai103 x 3 parts + 4 legacy hubs (0, 3, 6, 9)
    assert report["counts"] == {"settings": 1, "tombstone": 1, "user": 12, "progress": progress_total}
    assert report["records"] == 1 + 1 + 12 + progress_total
    assert report["target"] == {"store": "memory", "users": 1, "progress": 2}
    assert report["modes"] == ["merge", "replace"]
    plan = report["plan"]
    assert plan["compared"] is True
    assert plan["skipped"] == {
        "tombstonedInBackup": {"user": 1, "progress": 4},  # u0000: 3 ai103 parts + legacy
        "tombstonedInTarget": {"user": 1, "progress": 4},  # u0003 likewise
    }
    assert plan["users"] == {"new": 9, "existing": 1}
    # live: 10 users x 3 ai103 parts + legacy of u0006, u0009 = 32 parts
    assert plan["progress"] == {"newer": 30, "older": 1, "identical": 1}
    assert "estWrites" not in plan  # Firestore targets only
    assert (tmp_path / "data" / "restore" / upload_id / "ready.ndjson.gz").is_file()


# -- restore jobs ---------------------------------------------------------------------------------


def test_merge_restore_end_to_end(make_client: Any, tmp_path: Path, source: MemoryStore) -> None:
    source.put_tombstone(tombstone_hash("u0000"), AT)
    path = write_backup(source, tmp_path / "s.backup", passphrase=PASS)
    target = MemoryStore()
    target.upsert_user(UserRecord("u0001", "live@example.com", last_login_at=AT), touch_login=True)
    target.put_parts("u0001", "ai103", {"main": part("ai103", "main", T + 999)}, NOW_MS)
    target.put_tombstone(tombstone_hash("u0003"), AT)
    client = admin_client(make_client, tmp_path, store=target)
    rt = runtime(client)
    upload_id = upload(client, path)
    assert validate(client, upload_id, PASS)["state"] == "validated"

    wrong = start_job(client, upload_id, confirm="restore")
    assert (wrong.status_code, wrong.json()["code"]) == (422, "confirm_required")
    created = start_job(client, upload_id)
    assert created.status_code == 201, created.text
    job = created.json()["job"]
    assert (job["kind"], job["mode"], job["state"]) == ("restore", "merge", "scheduled")
    assert job["progress"] == {"done": 0, "total": job["total"]}
    busy = start_job(client, upload_id)
    assert busy.status_code in (409,)  # one restore at a time (or the upload is in use)

    done = wait_job(client, job["id"])
    assert done["state"] == "succeeded", done
    report = done["report"]
    assert report["ok"]
    assert report["countsOk"]
    assert report["skipped"] == {"settings": 0, "tombstone": 0, "user": 2, "progress": 8}
    assert (report["written"]["user"], report["kept"]["user"]) == (9, 1)
    assert report["kept"]["settings"] == 1  # merge keeps the target's site settings
    assert report["sample"]["checked"] >= 1
    assert report["sample"]["mismatched"] == 0
    assert done["progress"] == {"done": done["total"], "total": done["total"]}
    assert rt.maintenance_mode == "off"  # back to the previous mode
    assert done["prev"]["mode"] == "off"
    assert not (tmp_path / "data" / "restore" / upload_id).exists()  # staging deleted
    got = target.get_hub("u0001", "ai103", {})
    assert got["main"].upd == T + 999  # the target's newer part was kept
    assert got["cards"].upd == T + 1
    assert target.get_user("u0001").email == "live@example.com"  # type: ignore[union-attr]
    assert (target.get_user("u0000"), target.get_user("u0003")) == (None, None)  # tombstoned
    assert target.get_user("u0011") is not None
    assert target.is_tombstoned([tombstone_hash("u0000")]) == {tombstone_hash("u0000")}
    assert rt.site.current().tz == "Asia/Kolkata"  # merge: settings untouched
    stats = client.get("/api/admin/stats").json()
    assert stats["attentionJobs"] == []


def test_replace_restore_matches_the_source(make_client: Any, tmp_path: Path, source: MemoryStore) -> None:
    path = write_backup(source, tmp_path / "s.backup")
    target = MemoryStore()
    seed(target, 3, prefix="old")
    target.upsert_user(UserRecord("u0001", "live@example.com", last_login_at=AT), touch_login=True)
    target.put_parts("u0001", "ai103", {"main": part("ai103", "main", T + 999)}, NOW_MS)
    client = admin_client(make_client, tmp_path, store=target)
    rt = runtime(client)
    upload_id = upload(client, path)
    info = validate(client, upload_id)
    assert info["report"]["target"]["users"] == 4
    wrong = start_job(client, upload_id, mode="replace", confirm="RESTORE")
    assert (wrong.status_code, wrong.json()["code"]) == (422, "confirm_required")
    assert "REPLACE 4 USERS" in wrong.json()["message"]
    created = start_job(
        client, upload_id, mode="replace", confirm="REPLACE 4 USERS", exitMaintenanceOnSuccess=False
    )
    assert created.status_code == 201, created.text
    done = wait_job(client, created.json()["job"]["id"])
    assert done["state"] == "succeeded", done
    assert state_of(target) == state_of(source)  # exactly the backup, old users gone
    assert rt.maintenance_mode == "full"  # exitMaintenanceOnSuccess: false
    assert (rt.site.current().tz, rt.site.current().notice) == ("Europe/Berlin", "Restored notice")
    assert done["report"]["written"]["settings"] == 1


def test_restore_job_rules(make_client: Any, tmp_path: Path, source: MemoryStore) -> None:
    path = write_backup(source, tmp_path / "s.backup")
    client = admin_client(make_client, tmp_path)
    rt = runtime(client)
    upload_id = upload(client, path)
    assert validate(client, upload_id)["state"] == "validated"
    for body, code in (
        ({"mode": "both"}, "invalid"),
        ({"runAt": "yesterday"}, "invalid"),
        ({"runAt": "2020-01-01T00:00:00Z"}, "invalid"),
        ({"exitMaintenanceOnSuccess": "yes"}, "invalid"),
        ({"uploadId": "u" + "0" * 24}, "not_found"),
    ):
        response = client.post(
            "/api/admin/jobs",
            json={"kind": "restore", "uploadId": upload_id, "runAt": "now", "confirm": "RESTORE", **body},
            headers=API,
        )
        assert response.json()["code"] == code, (body, response.text)
    session(client, auth_age_s=25 * 3600)  # an old sign-in
    stale = start_job(client, upload_id)
    assert (stale.status_code, stale.json()["code"]) == (403, "reauth_required")
    session(client)

    # Scheduled for tonight: shown as upcoming full maintenance, cancellable, upload locked.
    later = start_job(client, upload_id, runAt="tonight")
    assert later.status_code == 201, later.text
    job = later.json()["job"]
    assert job["runAt"] > "2026"
    assert client.delete(f"/api/admin/restore/uploads/{upload_id}", headers=API).status_code == 409
    rt.clock.offset_ms = 0
    cancel = client.post(f"/api/admin/jobs/{job['id']}/cancel", json={"confirm": "CANCEL"}, headers=API)
    assert cancel.status_code == 200, cancel.text
    assert cancel.json()["job"]["state"] == "cancelled"
    assert client.delete(f"/api/admin/restore/uploads/{upload_id}", headers=API).status_code == 204


def test_upcoming_restore_and_missed(make_client: Any, tmp_path: Path, source: MemoryStore) -> None:
    path = write_backup(source, tmp_path / "s.backup")
    client = admin_client(make_client, tmp_path)
    rt = runtime(client)
    upload_id = upload(client, path)
    validate(client, upload_id)
    run_at = rt.clock.now_ms() + 5 * 60_000
    from datetime import UTC, datetime

    iso = datetime.fromtimestamp(run_at / 1000, UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    job = start_job(client, upload_id, runAt=iso).json()["job"]
    assert rt.upcoming() == {"mode": "full", "startAt": iso, "message": None}
    clock = rt.clock
    assert isinstance(clock, FixedClock)
    clock.advance(3 * 3600 * 1000)  # the server was down past the grace period
    rt.scheduler.tick()
    missed = client.get(f"/api/admin/jobs/{job['id']}").json()["job"]
    assert missed["state"] == "missed"
    assert rt.maintenance_mode == "off"


def test_running_restore_cannot_be_cancelled_and_reclaims_after_a_stale_heartbeat(
    make_client: Any, tmp_path: Path, source: MemoryStore
) -> None:
    path = write_backup(source, tmp_path / "s.backup")
    target = MemoryStore()
    client = admin_client(make_client, tmp_path, store=target)
    rt = runtime(client)
    upload_id = upload(client, path)
    validate(client, upload_id)
    job = start_job(client, upload_id, runAt="tonight").json()["job"]
    # Simulate an instance that claimed the job and died after two batches' worth of nothing.
    assert target.claim_job(job["id"], "dead-instance", {"scheduled"})
    target.update_job(job["id"], {"heartbeat": "2026-10-01T00:00:00Z", "prev": {"mode": "off"}}, expect={})
    rt.scheduler.refresh()
    cancel = client.post(f"/api/admin/jobs/{job['id']}/cancel", json={"confirm": "CANCEL"}, headers=API)
    assert cancel.status_code == 409
    events = rt.scheduler.tick()
    assert events == [f"reclaimed {job['id']}"]
    done = wait_job(client, job["id"])
    assert done["state"] == "succeeded", done
    assert done["holder"] == rt.scheduler.holder
    assert state_of(target) == state_of(source)
    assert rt.maintenance_mode == "off"


def test_quota_exhausted_pauses_until_after_the_reset(
    make_client: Any, tmp_path: Path, source: MemoryStore
) -> None:
    from datetime import datetime

    from app.store.base import QuotaExhausted

    path = write_backup(source, tmp_path / "s.backup")
    target = MemoryStore()
    client = admin_client(make_client, tmp_path, store=target)
    rt = runtime(client)
    upload_id = upload(client, path)
    validate(client, upload_id)
    reset = datetime(2026, 10, 13, 7, tzinfo=datetime.now().astimezone().tzinfo)
    target.fail_next("restore_batch", QuotaExhausted("writes", reset))
    job = start_job(client, upload_id).json()["job"]
    paused = wait_job(client, job["id"], states={"paused_quota"})
    assert paused["resumeAt"] == "2026-10-13T07:05:00Z"  # the next Pacific midnight + 5 min
    assert "quota" in paused["pauseReason"]
    assert rt.maintenance_mode == "full"
    assert rt.scheduler.tick() == []  # not before resumeAt
    clock = rt.clock
    assert isinstance(clock, FixedClock)
    clock.set(int(datetime.fromisoformat("2026-10-13T07:05:00+00:00").timestamp() * 1000))
    assert rt.scheduler.tick() == [f"resumed {job['id']}"]
    done = wait_job(client, job["id"])
    assert done["state"] == "succeeded", done
    assert state_of(target) == state_of(source)
    assert rt.maintenance_mode == "off"


def test_plan_on_a_firestore_target_estimates_writes(tmp_path: Path, source: MemoryStore) -> None:
    from app.backup import reader
    from app.restore.plan import build_plan

    class FirestoreLike(MemoryStore):
        kind = "firestore"

    path = write_backup(source, tmp_path / "s.backup")
    _, verified = reader.validate_file(
        path, tmp_path / "ready.ndjson.gz", passphrase=None, max_part_gz=131_072
    )
    target = FirestoreLike()
    target.put_parts("u0001", "ai103", {"main": part("ai103", "main", T + 999)}, NOW_MS)
    ready = tmp_path / "ready.ndjson.gz"
    plan = build_plan(
        target, ready, verified.counts, reads_left=50_000, writes_left=40, writes_per_day=19_000
    )
    assert plan["compared"] is True
    # 12 users + 12 ai103 docs + 4 legacy docs + 0 tombstones + 1 checkpoint
    assert (plan["estWrites"], plan["daysNeeded"], plan["fitsToday"]) == (29, 1, True)
    short = build_plan(target, ready, verified.counts, reads_left=10, writes_left=10, writes_per_day=20)
    assert short["compared"] is False  # the lookups would cost more than 80% of the reads left
    assert "users" not in short
    assert (short["estWrites"], short["daysNeeded"], short["fitsToday"]) == (29, 2, False)


def test_test_reset_forgets_uploads(make_client: Any, tmp_path: Path) -> None:
    client = admin_client(make_client, tmp_path)
    body = {"name": "x.backup", "size": 100, "lastModified": 1}
    assert client.post("/api/admin/restore/uploads", json=body, headers=API).status_code == 201
    assert client.post("/api/test/reset", headers={"X-StudyHubs": "1"}).status_code == 204
    session(client)
    assert client.get("/api/admin/restore/uploads").json() == {"uploads": []}


def test_only_admins_sign_in_during_full_maintenance(make_client: Any, tmp_path: Path) -> None:
    from tests.api.conftest import sign_in
    from tests.api.test_admin_api import put

    client = admin_client(make_client, tmp_path)
    assert put(client, "/api/admin/maintenance", {"mode": "full", "confirm": "FULL"}).json()["mode"] == "full"
    client.cookies.clear()
    sign_in(client, "boss-2", email=ADMIN)  # a long restore must not lock the admin out
    assert client.get("/api/admin/stats").status_code == 200
    store = store_of(client)
    assert store.get_user("boss-2") is None  # no user write during maintenance
    client.cookies.clear()
    from app.auth.fake import make_fake_token

    for token in (
        make_fake_token("learner", "l@example.com", emailVerified=True, provider="google.com"),
        "x",
    ):
        blocked = client.post("/api/auth/session", json={"idToken": token}, headers=API)
        assert (blocked.status_code, blocked.json()["code"]) == (503, "maintenance")
