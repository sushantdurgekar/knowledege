"""Helpers for the restore tests: make a backup from a store, upload it in chunks,
validate it and run a restore job through the admin API."""

from __future__ import annotations

import gzip
import hashlib
import json
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from app.backup.writer import BackupSource, BackupWriter
from app.restore.uploads import CHUNK_SIZE
from app.store.base import PartIn, Store, UserRecord, tombstone_hash

API = {"X-StudyHubs": "1", "Origin": "http://127.0.0.1:10000"}
AT = datetime(2026, 10, 12, 9, 30, tzinfo=UTC)
T = 1_791_700_000_000
PASS = "correct horse battery staple"
TERMINAL = {"succeeded", "needs_attention", "failed", "cancelled", "missed"}


def part(hub: str, name: str, upd: int, extra: Any = None) -> PartIn:
    payload: dict[str, Any] = {"hub": hub, "upd": upd}
    if name == "main":
        payload["S"] = {"done": {"m1": True, "m2": upd % 2 == 0}, "x": extra}
    elif name == "mocks":
        payload["list"] = [{"score": upd % 100, "x": extra}]
    elif name == "cards":
        payload["map"] = {"c1": {"due": upd}, "x": extra}
    else:
        payload.update(key="k", raw=json.dumps({"done": [1, 0, 1], "x": extra}))
    raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode()
    done = None
    if name == "main":
        done = sum(1 for v in payload["S"]["done"].values() if v)
    elif name == "legacy":
        done = 2
    return PartIn(upd=upd, gz=gzip.compress(raw, mtime=0), raw_len=len(raw), done=done)


def seed(store: Store, users: int, *, prefix: str = "u", now_ms: int = T + 3_600_000) -> None:
    """`users` users, each with an ai103 hub (main, mocks, cards) and every third an ai901 legacy hub."""
    for i in range(users):
        uid = f"{prefix}{i:04d}"
        store.upsert_user(
            UserRecord(uid, f"{uid}@example.com", True, f"N{i}", None, "google.com", last_login_at=AT),
            touch_login=True,
        )
        store.put_parts(
            uid,
            "ai103",
            {
                "main": part("ai103", "main", T + i),
                "mocks": part("ai103", "mocks", T + i),
                "cards": part("ai103", "cards", T + i, "é ✓"),
            },
            now_ms,
        )
        if i % 3 == 0:
            store.put_parts(uid, "ai901", {"legacy": part("ai901", "legacy", T + i)}, now_ms)


def write_backup(store: Store, out: Path, *, passphrase: str | None = None) -> Path:
    writer = BackupWriter(
        store,
        source=BackupSource("t", "t", store.kind, None, "http://127.0.0.1:10000"),
        created_at=AT,
        site={"tz": "Europe/Berlin", "notice": "Restored notice"},
        estimated={"user": 0, "progress": 0},
        consistent=True,
        passphrase=passphrase,
    )
    with out.open("wb") as f:
        for chunk in writer.chunks():
            f.write(chunk)
    return out


def state_of(store: Store) -> dict[str, Any]:
    """The decoded users and progress of a store (what a restore must reproduce)."""
    users = sorted(
        (
            u.uid,
            u.email,
            u.email_verified,
            u.name,
            u.photo,
            u.provider,
            u.created_at.isoformat() if u.created_at else None,
            u.last_login_at.isoformat() if u.last_login_at else None,
        )
        for u in store.iter_users()
    )
    progress = []
    for uid, hub, parts in store.iter_progress():
        for name, out in parts.items():
            assert out.gz is not None
            progress.append((uid, hub, name, out.upd, json.loads(gzip.decompress(out.gz))))
    hubs = sorted(
        (uid, h.hub, h.done)
        for uid in {u[0] for u in users} | {p[0] for p in progress}
        for h in store.list_hubs(uid)
    )
    return {"users": users, "progress": sorted(progress, key=lambda p: p[:3]), "hubs": hubs}


def upload(client: TestClient, path: Path, *, name: str | None = None) -> str:
    data = path.read_bytes()
    body = {"name": name or path.name, "size": len(data), "lastModified": 1_760_000_000_000}
    created = client.post("/api/admin/restore/uploads", json=body, headers=API)
    assert created.status_code in (200, 201), created.text
    info = created.json()
    assert info["chunkSize"] == CHUNK_SIZE
    for n in range(info["chunks"]):
        if n in info["received"]:
            continue
        chunk = data[n * CHUNK_SIZE : (n + 1) * CHUNK_SIZE]
        put_chunk(client, info["uploadId"], n, chunk)
    return str(info["uploadId"])


def put_chunk(client: TestClient, upload_id: str, n: int, chunk: bytes, sha: str | None = None) -> Any:
    headers = {
        **API,
        "Content-Type": "application/octet-stream",
        "X-Chunk-SHA256": sha or hashlib.sha256(chunk).hexdigest(),
    }
    return client.put(f"/api/admin/restore/uploads/{upload_id}/chunks/{n}", content=chunk, headers=headers)


def validate(
    client: TestClient, upload_id: str, passphrase: str | None = None, timeout: float = 60
) -> dict[str, Any]:
    body = {"passphrase": passphrase} if passphrase else {}
    started = client.post(f"/api/admin/restore/uploads/{upload_id}/validate", json=body, headers=API)
    assert started.status_code == 202, started.text
    deadline = time.monotonic() + timeout
    while True:
        info = client.get(f"/api/admin/restore/uploads/{upload_id}").json()
        if info["state"] != "validating":
            return dict(info)
        assert time.monotonic() < deadline, "validation did not finish"
        time.sleep(0.02)


def start_job(
    client: TestClient, upload_id: str, *, mode: str = "merge", confirm: str | None = None, **extra: Any
) -> Any:
    body = {
        "kind": "restore",
        "uploadId": upload_id,
        "mode": mode,
        "runAt": "now",
        "confirm": confirm or "RESTORE",
        **extra,
    }
    return client.post("/api/admin/jobs", json=body, headers=API)


def wait_job(
    client: TestClient, job_id: str, *, states: set[str] | None = None, timeout: float = 120
) -> dict[str, Any]:
    states = states or TERMINAL
    deadline = time.monotonic() + timeout
    while True:
        job = client.get(f"/api/admin/jobs/{job_id}").json()["job"]
        if job["state"] in states:
            return dict(job)
        assert time.monotonic() < deadline, f"job stuck in {job['state']}: {job}"
        time.sleep(0.02)


def tombstone_for(uid: str) -> str:
    return tombstone_hash(uid)
