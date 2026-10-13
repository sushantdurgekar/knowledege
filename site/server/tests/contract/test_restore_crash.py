"""S18 (build-contracts.md section 26): kill the server (-9) in the middle of a restore,
restart it, and the job resumes from its checkpoint to the identical final state.

Runs two real uvicorn processes one after the other on a Postgres database of their
own (DATABASE_URL_TEST's server). The first is slowed down (RESTORE_BATCH_DELAY_MS,
APP_ENV=test only) and killed with SIGKILL once some batches are committed; the second
starts with the job still `running` under the dead holder. Once its heartbeat is more
than 2 minutes old (the test clock moves 3 minutes ahead) a tick reclaims the job and
resumes it. Every batch was committed together with its checkpoint, so nothing is
applied twice: the written counts equal the backup's.
"""

from __future__ import annotations

import os
import signal
import socket
import subprocess
import sys
import time
import uuid
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import httpx
import psycopg
import pytest

from app.auth.fake import FakeAuthenticator
from app.auth.identity import Identity
from app.clock import Clock
from app.config import DEV_SECRET_KEY
from app.restore.uploads import CHUNK_SIZE
from app.store.memory import MemoryStore
from app.store.postgres import PostgresStore
from tests.contract.conftest import need_pg
from tests.restore_support import seed, state_of, write_backup
from tests.support import FakeBuild, FakePublic

SERVER_DIR = Path(__file__).resolve().parents[2]
ADMIN = "boss@example.com"
ORIGIN = "http://127.0.0.1:10000"
HEADERS = {"X-StudyHubs": "1", "Origin": ORIGIN}


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


@pytest.fixture
def database() -> Iterator[str]:
    """A database of its own on DATABASE_URL_TEST's server, dropped afterwards."""
    base = need_pg()
    name = "s18_" + uuid.uuid4().hex[:10]
    with psycopg.connect(base, autocommit=True) as conn:
        conn.execute(f"CREATE DATABASE {name}")
    url = base.rsplit("/", 1)[0] + "/" + name
    try:
        yield url
    finally:
        with psycopg.connect(base, autocommit=True) as conn:
            conn.execute(f"DROP DATABASE IF EXISTS {name} WITH (FORCE)")


class Server:
    def __init__(self, env: dict[str, str], log: Path) -> None:
        self.port = _free_port()
        self.log = log
        command = [
            sys.executable, "-m", "uvicorn", "app.main:app",
            "--host", "127.0.0.1", "--port", str(self.port), "--workers", "1",
        ]  # fmt: skip
        self._out = log.open("ab")
        self.process = subprocess.Popen(  # noqa: S603 - our own interpreter and app
            command, cwd=SERVER_DIR, env={**env, "PORT": str(self.port)}, stdout=self._out, stderr=self._out
        )
        identity = Identity(
            "boss", ADMIN, provider="google.com", email_verified=True, auth_time=int(time.time())
        )
        cookie = FakeAuthenticator(DEV_SECRET_KEY.encode(), Clock(), session_days=14).create_session(
            "t", identity
        )
        self.http = httpx.Client(
            base_url=f"http://127.0.0.1:{self.port}",
            cookies={"sh_session": cookie},
            headers=HEADERS,
            timeout=30,
        )
        deadline = time.monotonic() + 30
        while True:
            try:
                if self.http.get("/healthz").status_code == 200:
                    return
            except httpx.TransportError:
                pass
            if self.process.poll() is not None or time.monotonic() > deadline:
                raise AssertionError(f"uvicorn did not start:\n{log.read_text(errors='replace')}")
            time.sleep(0.1)

    def kill(self) -> None:
        self.process.send_signal(signal.SIGKILL)
        self.process.wait(timeout=10)
        self.close()

    def stop(self) -> None:
        if self.process.poll() is None:
            self.process.terminate()
            self.process.wait(timeout=15)
        self.close()

    def close(self) -> None:
        self.http.close()
        self._out.close()

    def job(self, job_id: str) -> dict[str, Any]:
        response = self.http.get(f"/api/admin/jobs/{job_id}")
        assert response.status_code == 200, response.text
        return dict(response.json()["job"])


def _upload(server: Server, path: Path) -> str:
    data = path.read_bytes()
    created = server.http.post(
        "/api/admin/restore/uploads", json={"name": path.name, "size": len(data), "lastModified": 1}
    )
    assert created.status_code == 201, created.text
    upload_id = str(created.json()["uploadId"])
    import hashlib

    for n in range(created.json()["chunks"]):
        chunk = data[n * CHUNK_SIZE : (n + 1) * CHUNK_SIZE]
        put = server.http.put(
            f"/api/admin/restore/uploads/{upload_id}/chunks/{n}",
            content=chunk,
            headers={"X-Chunk-SHA256": hashlib.sha256(chunk).hexdigest()},
        )
        assert put.status_code == 200, put.text
    return upload_id


def test_s18_kill_mid_apply_then_resume(
    database: str, build: FakeBuild, public: FakePublic, tmp_path: Path
) -> None:
    source = MemoryStore()
    seed(source, 600)  # 600 users, 1,800 + 200 parts: 6 batches of 500 records
    path = write_backup(source, tmp_path / "big.backup")
    expected = state_of(source)
    env = {
        **{k: v for k, v in os.environ.items() if k not in ("FIRESTORE_EMULATOR_HOST", "SECRET_KEY")},
        "APP_ENV": "test",
        "STORE": "postgres",
        "DATABASE_URL": database,
        "AUTH_MODE": "fake",
        "ADMIN_EMAILS": ADMIN,
        "PUBLIC_ORIGIN": ORIGIN,
        "DATA_DIR": str(tmp_path / "data"),
        "HUBS_DIR": str(build.root),
        "PUBLIC_DIR": str(public.root),
        "RESTORE_BATCH_DELAY_MS": "700",
    }
    log = tmp_path / "server.log"
    first = Server(env, log)
    try:
        upload_id = _upload(first, path)
        assert first.http.post(f"/api/admin/restore/uploads/{upload_id}/validate", json={}).status_code == 202
        deadline = time.monotonic() + 60
        while (info := first.http.get(f"/api/admin/restore/uploads/{upload_id}").json())[
            "state"
        ] == "validating":
            assert time.monotonic() < deadline
            time.sleep(0.05)
        assert info["state"] == "validated", info
        created = first.http.post(
            "/api/admin/jobs",
            json={"kind": "restore", "uploadId": upload_id, "runAt": "now", "confirm": "RESTORE"},
        )
        assert created.status_code == 201, created.text
        job_id = created.json()["job"]["id"]
        total = created.json()["job"]["total"]
        deadline = time.monotonic() + 60
        while True:  # wait until two batches are committed, then pull the plug
            job = first.job(job_id)
            if job["progress"]["done"] >= 1000:
                break
            assert job["state"] in ("scheduled", "running"), job
            assert time.monotonic() < deadline, job
            time.sleep(0.05)
        first.kill()
    except BaseException:
        first.stop()
        raise
    assert 1000 <= job["progress"]["done"] < total

    second = Server(env, log)
    try:
        stuck = second.job(job_id)
        assert stuck["state"] == "running"  # the dead holder's heartbeat is still fresh
        assert stuck["holder"] != ""
        assert stuck["progress"]["done"] >= job["progress"]["done"]
        clock = second.http.post("/api/test/clock", json={"offsetMs": 3 * 60_000})
        assert clock.status_code == 200
        events = second.http.post("/api/test/tick").json()["events"]
        assert events == [f"reclaimed {job_id}"], events
        deadline = time.monotonic() + 120
        while (done := second.job(job_id))["state"] == "running":
            assert time.monotonic() < deadline, done
            time.sleep(0.1)
        assert done["state"] == "succeeded", done
        assert done["progress"] == {"done": total, "total": total}
        report = done["report"]
        assert report["ok"]
        assert report["countsOk"]
        assert report["written"] == {"settings": 0, "tombstone": 0, "user": 600, "progress": 2000}
        assert report["kept"] == {"settings": 1, "tombstone": 0, "user": 0, "progress": 0}
        assert second.http.get("/api/admin/maintenance").json()["mode"] == "off"
    finally:
        second.stop()
    target = PostgresStore(database)
    try:
        assert state_of(target) == expected  # identical, nothing applied twice
    finally:
        target.close()
    assert "reclaimed and resumed" in log.read_text(errors="replace")
