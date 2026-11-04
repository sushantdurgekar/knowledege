"""The M2 APIs end to end on each adapter (memory, and a fresh Firestore emulator
database): maintenance with its optimistic version, a scheduled window, a backup
download through `backup_tool.py verify`, the account listing/export and the
delete-account cascade with its tombstone."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from app.clock import FixedClock
from app.config import SITE_DIR
from app.store.base import tombstone_hash
from tests.api.conftest import API, NOW_MS, main, mocks, runtime, sign_in, sync
from tests.api.test_admin_api import ADMIN, session
from tests.contract.conftest import Adapter

TOOL = SITE_DIR / "scripts" / "backup_tool.py"
TEST = {"X-StudyHubs": "1"}


def wait_for_meter(client: TestClient) -> None:
    deadline = time.monotonic() + 10
    while runtime(client).meter.load_state == "pending" and time.monotonic() < deadline:
        time.sleep(0.01)  # the boot-time usage read runs in the background


def test_m2_flow(fresh: Adapter, make_client: Any, tmp_path: Path) -> None:
    client: TestClient = make_client(store=fresh.store, clock=FixedClock(NOW_MS), admin_emails=(ADMIN,))
    wait_for_meter(client)
    rt = runtime(client)

    # Two learners with progress.
    for uid in ("learner-a", "learner-b"):
        sign_in(client, uid)
        assert sync(client, {"ai103": {"main": main(done=2), "mocks": mocks()}}).status_code == 200
    listed = client.get("/api/me/progress").json()["hubs"]
    assert [(h["hub"], h["slug"], h["done"], sorted(h["parts"])) for h in listed] == [
        ("ai103", "ai-103", 2, ["main", "mocks"])
    ]
    export = client.get("/api/me/export").json()
    assert [(r["hub"], r["part"]) for r in export["progress"]] == [("ai103", "main"), ("ai103", "mocks")]
    assert export["progress"][0]["data"] == main(done=2)

    # Maintenance: optimistic version, sync paused, then off again.
    session(client)
    current = client.get("/api/admin/maintenance").json()
    put = client.put(
        "/api/admin/maintenance", json={"mode": "read_only", "version": current["version"]}, headers=API
    )
    assert put.status_code == 200, put.text
    stale = client.put(
        "/api/admin/maintenance", json={"mode": "off", "version": current["version"]}, headers=API
    )
    assert stale.status_code == 409
    sign_in(client, "learner-a")
    paused = sync(client, {"ai103": {"main": main(done=3)}})
    assert paused.status_code == 503
    assert paused.json()["code"] == "maintenance"
    session(client)
    assert client.put("/api/admin/maintenance", json={"mode": "off"}, headers=API).status_code == 200

    # A window five minutes ahead: upcoming, started by a tick, finished by a later one.
    start = rt.clock.now() + timedelta(minutes=5)
    job = client.post(
        "/api/admin/jobs",
        json={"kind": "maintenance", "mode": "read_only", "startAt": start.isoformat(), "durationMin": 15},
        headers=API,
    ).json()["job"]
    assert client.get("/api/me").json()["upcoming"]["startAt"] == job["startAt"]
    rt.clock.set(int(datetime.fromisoformat(job["startAt"]).timestamp() * 1000))  # type: ignore[attr-defined]
    session(client)
    assert client.post("/api/test/tick", headers=TEST).json()["events"] == [f"started {job['id']}"]
    assert client.get("/api/admin/maintenance").json()["mode"] == "read_only"
    rt.clock.advance(15 * 60_000)  # type: ignore[attr-defined]
    session(client)
    assert client.post("/api/test/tick", headers=TEST).json()["events"] == [f"finished {job['id']}"]
    assert client.get("/api/admin/maintenance").json()["mode"] == "off"
    assert client.get(f"/api/admin/jobs/{job['id']}").json()["job"]["state"] == "succeeded"
    for odd in ("__x__", "%2E%2E", "j" * 64):  # ids Firestore refuses: a plain 404, no store error
        assert client.get(f"/api/admin/jobs/{odd}").status_code == 404, odd
        cancel = client.post(f"/api/admin/jobs/{odd}/cancel", json={"confirm": "CANCEL"}, headers=API)
        assert cancel.status_code == 404, odd

    # A consistent backup through the ticket, verified offline, then logged (the admin
    # session above was installed directly, so only the two learners have user docs).
    estimate = client.get("/api/admin/backups/estimate").json()
    assert (estimate["users"], estimate["docs"], estimate["tombstones"], estimate["fits"]) == (2, 2, 0, True)
    created = client.post(
        "/api/admin/backups",
        json={"passphrase": None, "requireReadOnly": True, "confirm": "BACKUP"},
        headers=API,
    ).json()
    download = client.get(f"/api/admin/backups/{created['ticket']}")
    assert download.status_code == 200
    path = tmp_path / created["filename"]
    path.write_bytes(download.content)
    run = subprocess.run(  # noqa: S603 - our own interpreter and script
        [sys.executable, str(TOOL), "verify", str(path)],
        capture_output=True,
        text=True,
        timeout=120,
        env={"PATH": os.environ.get("PATH", "")},
        check=False,
    )
    assert run.returncode == 0, run.stderr
    summary = json.loads(run.stdout)
    assert summary["counts"] == {"settings": 1, "tombstone": 0, "user": 2, "progress": 4}
    assert summary["consistent"] is True
    log = client.get("/api/admin/backups/log").json()
    assert [entry["fileSha256"] for entry in log] == [summary["fileSha256"]]
    assert client.get("/api/admin/maintenance").json()["mode"] == "off"

    # Deleting an account removes its documents and leaves only a tombstone.
    sign_in(client, "learner-b")
    deleted = client.request("DELETE", "/api/me", json={"confirm": "DELETE"}, headers=API)
    assert deleted.status_code == 204, deleted.text
    dump = client.get("/api/test/store", headers=TEST).json()
    assert "learner-b" not in {u["uid"] for u in dump["users"]}
    assert {p["uid"] for p in dump["progress"]} == {"learner-a"}
    assert fresh.store.is_tombstoned([tombstone_hash("learner-b")]) == {tombstone_hash("learner-b")}
    session(client)
    assert client.get("/api/admin/backups/estimate").json()["tombstones"] == 1
