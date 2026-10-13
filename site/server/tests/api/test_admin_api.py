"""Admin API (build-contracts.md sections 17, 19, 22): the admin predicate matrix, the
destructive-action rules, stats shape, maintenance modes with MAINTENANCE_FORCE, the
settings, jobs, and backups end to end through `backup_tool.py verify`."""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.auth.identity import Identity
from app.clock import FixedClock
from app.config import SITE_DIR
from app.store.base import Conflict, Unavailable
from tests.api.conftest import API, NOW_MS, main, runtime, sign_in, store, sync

ADMIN = "boss@example.com"
TOOL = SITE_DIR / "scripts" / "backup_tool.py"
HIDDEN = {"code": "not_found", "message": "No such API endpoint"}


def session(
    client: TestClient,
    uid: str = "boss",
    *,
    email: str = ADMIN,
    provider: str = "google.com",
    verified: bool = True,
    auth_age_s: int = 60,
) -> None:
    """Install a session cookie directly (any provider, any sign-in age)."""
    rt = runtime(client)
    auth_time = int(rt.clock.now_s()) - auth_age_s
    identity = Identity(uid, email, provider=provider, email_verified=verified, auth_time=auth_time)
    client.cookies.clear()  # drop a cookie a sign-in response set (another domain key in the jar)
    client.cookies.set("sh_session", rt.auth.create_session("t", identity))


@pytest.fixture
def admin(make_client: Any, clock: FixedClock) -> TestClient:
    client: TestClient = make_client(clock=clock, admin_emails=(ADMIN, "Second@Example.com"))
    session(client)
    return client


def put(client: TestClient, url: str, body: dict[str, Any]) -> Any:
    return client.put(url, json=body, headers=API)


def post(client: TestClient, url: str, body: dict[str, Any] | None = None) -> Any:
    return client.post(url, json=body or {}, headers=API)


# -- §17 admin predicate --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("email", "provider", "verified", "allowed"),
    [
        (ADMIN, "google.com", True, True),
        ("BOSS@Example.COM", "google.com", True, True),  # case-insensitive
        ("second@example.com", "google.com", True, True),
        (ADMIN, "password", True, False),  # Google sign-in only
        (ADMIN, "google.com", False, False),  # verified email only
        ("other@example.com", "google.com", True, False),
        (ADMIN, "github.com", True, False),
    ],
)
def test_admin_predicate_matrix(
    make_client: Any, clock: FixedClock, email: str, provider: str, verified: bool, allowed: bool
) -> None:
    client = make_client(clock=clock, admin_emails=(ADMIN, "Second@Example.com"))
    session(client, email=email, provider=provider, verified=verified)
    response = client.get("/api/admin/stats")
    me = client.get("/api/me").json()
    assert me["user"]["admin"] is allowed
    if allowed:
        assert response.status_code == 200
    else:
        assert response.status_code == 404
        assert response.json() == HIDDEN
        assert response.json() == client.get("/api/admin/nope").json()  # same as an unknown path


def test_no_admins_by_default_and_anonymous(make_client: Any, clock: FixedClock) -> None:
    client = make_client(clock=clock)
    assert client.get("/api/admin/stats").json() == HIDDEN
    session(client)
    assert client.get("/api/admin/stats").status_code == 404
    assert client.get("/api/me").json()["user"]["admin"] is False


def test_hidden_before_csrf_and_revocation(admin: TestClient, make_client: Any, clock: FixedClock) -> None:
    other = make_client(clock=clock, admin_emails=(ADMIN,))
    session(other, "pleb", email="pleb@example.com")
    for method in ("post", "put"):
        response = getattr(other, method)("/api/admin/maintenance", json={"mode": "off"})
        assert response.status_code == 404  # non-admins never learn the route exists
    assert admin.put("/api/admin/maintenance", json={"mode": "off"}).status_code == 403  # csrf
    runtime(admin).auth.revoked.add("boss")  # type: ignore[attr-defined]
    assert admin.get("/api/admin/stats").status_code == 404  # re-verified with check_revoked


# -- §17 destructive actions ----------------------------------------------------------------------


def test_destructive_actions_need_recent_sign_in_and_confirmation(admin: TestClient) -> None:
    actions: list[tuple[str, str, dict[str, Any], str]] = [
        ("post", "/api/admin/backups", {"requireReadOnly": True}, "BACKUP"),
        ("put", "/api/admin/maintenance", {"mode": "full"}, "FULL"),
    ]
    for method, url, body, phrase in actions:
        response = getattr(admin, method)(url, json=body, headers=API)
        assert response.status_code == 422, url
        assert response.json()["code"] == "confirm_required"
        assert phrase in response.json()["message"]
        wrong = getattr(admin, method)(url, json={**body, "confirm": phrase.lower()}, headers=API)
        assert wrong.json()["code"] == "confirm_required"
    session(admin, auth_age_s=25 * 3600)  # signed in more than 24 h ago
    for method, url, body, phrase in actions:
        response = getattr(admin, method)(url, json={**body, "confirm": phrase}, headers=API)
        assert response.status_code == 403, url
        assert response.json()["code"] == "reauth_required"
    # read-only maintenance is not destructive: no confirmation, any sign-in age
    assert put(admin, "/api/admin/maintenance", {"mode": "read_only"}).status_code == 200


def test_scheduling_full_and_cancelling_need_a_recent_sign_in(admin: TestClient) -> None:
    full = {
        "kind": "maintenance",
        "mode": "full",
        "startAt": "2026-10-20T01:00:00Z",
        "durationMin": 15,
        "confirm": "FULL",
    }
    read_only = post(admin, "/api/admin/jobs", {**full, "mode": "read_only"})
    assert read_only.status_code == 201
    job_id = read_only.json()["job"]["id"]
    session(admin, auth_age_s=24 * 3600 + 1)
    for url, body in (("/api/admin/jobs", full), (f"/api/admin/jobs/{job_id}/cancel", {"confirm": "CANCEL"})):
        response = post(admin, url, body)
        assert response.status_code == 403, url
        assert response.json()["code"] == "reauth_required"
    assert admin.get(f"/api/admin/jobs/{job_id}").json()["job"]["state"] == "scheduled"
    session(admin, auth_age_s=24 * 3600 - 60)  # just inside the window
    assert post(admin, "/api/admin/jobs", full).status_code == 201
    assert post(admin, f"/api/admin/jobs/{job_id}/cancel", {"confirm": "CANCEL"}).status_code == 200


def test_cancel_restores_the_mode_before_the_job_is_marked(admin: TestClient) -> None:
    rt = runtime(admin)
    body = {"kind": "maintenance", "mode": "read_only", "startAt": "tonight", "durationMin": 30}
    job = post(admin, "/api/admin/jobs", body).json()["job"]
    rt.clock.set(int(datetime.fromisoformat(job["startAt"]).timestamp() * 1000))  # type: ignore[attr-defined]
    session(admin)
    assert admin.post("/api/test/tick", headers={"X-StudyHubs": "1"}).json()["events"] == [
        f"started {job['id']}"
    ]
    store(admin).fail_next("put_setting", Unavailable("blip"))
    failed = post(admin, f"/api/admin/jobs/{job['id']}/cancel", {"confirm": "CANCEL"})
    assert failed.status_code == 503
    # Nothing half-done: the window still runs and can be cancelled again.
    assert admin.get(f"/api/admin/jobs/{job['id']}").json()["job"]["state"] == "running"
    assert admin.get("/api/admin/maintenance").json()["mode"] == "read_only"
    retried = post(admin, f"/api/admin/jobs/{job['id']}/cancel", {"confirm": "CANCEL"})
    assert retried.json()["job"]["state"] == "cancelled"
    assert admin.get("/api/admin/maintenance").json()["mode"] == "off"


# -- §19 stats -------------------------------------------------------------------------------------


def test_stats_shape(admin: TestClient) -> None:
    sign_in(admin, "learner")  # one user doc, then back to the admin
    session(admin)
    body = admin.get("/api/admin/stats").json()
    assert body["store"] == "memory"
    assert body["users"] == 1
    assert set(body["quotaDay"]) >= {"day", "resetsAt", "resetsAtLocal"}
    assert body["quotaDay"]["resetsAt"].endswith("T07:00:00Z")  # Pacific midnight (PDT)
    assert body["quotaDay"]["resetsAtLocal"] == "12:30 IST"
    fs = body["firestore"]
    assert set(fs) == {"writes", "reads", "deletes", "storage", "egressMonth"}
    assert fs["writes"]["limit"] == 20_000
    assert fs["writes"]["budget"] == 19_000
    assert fs["writes"]["tier"] == 1
    assert fs["reads"]["used"] >= 1
    assert set(fs["storage"]) >= {"estBytes", "limit", "asOf"}
    assert set(body["host"]) == {"egressMonth", "rssBytes", "ramLimit"}
    assert body["host"]["egressMonth"]["limit"] == 5_000_000_000
    assert body["host"]["rssBytes"] > 0
    assert body["maintenance"]["mode"] == "off"
    assert body["jobs"] == []
    assert body["lastBackup"] is None
    assert body["policy"]["tier"] == 1
    assert body["tier"] == 1


def test_recount(admin: TestClient) -> None:
    sign_in(admin, "learner")
    sync(admin, {"ai103": {"main": main()}})
    session(admin)
    response = post(admin, "/api/admin/stats/recount")
    assert response.status_code == 200
    storage = response.json()["storage"]
    assert storage["docs"] == 1
    assert storage["estBytes"] > 0
    assert admin.get("/api/admin/stats").json()["firestore"]["storage"]["estBytes"] == storage["estBytes"]
    admin.post("/api/test/quota", json={"reads": 49_999}, headers={"X-StudyHubs": "1"})
    refused = post(admin, "/api/admin/stats/recount")
    assert refused.status_code == 409
    assert refused.json()["code"] == "quota"


# -- §19 maintenance --------------------------------------------------------------------------------


def test_maintenance_modes_gate_sync(admin: TestClient) -> None:
    got = admin.get("/api/admin/maintenance").json()
    assert (got["mode"], got["forced"], got["version"]) == ("off", None, 0)
    response = put(
        admin, "/api/admin/maintenance", {"mode": "read_only", "message": "Upgrading", "version": 0}
    )
    assert response.status_code == 200
    assert response.json()["mode"] == "read_only"
    assert response.json()["version"] == 1

    sign_in(admin, "learner")
    blocked = sync(admin, {"ai103": {"main": main()}})
    assert blocked.status_code == 503
    assert blocked.json()["code"] == "maintenance"
    assert admin.get("/api/progress/ai103").status_code == 200  # reads still work
    assert admin.get("/api/me").json()["maintenance"] == {
        "mode": "read_only",
        "message": "Upgrading",
        "until": None,
    }

    session(admin)
    stale = put(admin, "/api/admin/maintenance", {"mode": "off", "version": 0})
    assert stale.status_code == 409
    assert stale.json()["code"] == "conflict"
    full = put(admin, "/api/admin/maintenance", {"mode": "full", "confirm": "FULL", "version": 1})
    assert full.json()["mode"] == "full"
    sign_in_blocked = admin.post("/api/auth/session", json={"idToken": "x"}, headers=API)
    assert sign_in_blocked.status_code == 503
    assert admin.get("/api/admin/stats").status_code == 200  # admin works in every mode
    assert put(admin, "/api/admin/maintenance", {"mode": "off"}).json()["mode"] == "off"
    session(admin, "learner", email="learner@example.com")
    assert sync(admin, {"ai103": {"main": main()}}).status_code == 200


def test_maintenance_force_overrides_the_setting(make_client: Any, clock: FixedClock) -> None:
    client = make_client(clock=clock, admin_emails=(ADMIN,), maintenance_force="read_only")
    session(client)
    got = client.get("/api/admin/maintenance").json()
    assert (got["mode"], got["forced"]) == ("read_only", "read_only")
    after = put(client, "/api/admin/maintenance", {"mode": "off"}).json()
    assert (after["mode"], after["stored"]["mode"]) == ("read_only", "off")  # stored, but forced wins
    session(client, "learner", email="learner@example.com")
    assert sync(client, {"ai103": {"main": main()}}).status_code == 503


def test_maintenance_validation(admin: TestClient) -> None:
    assert put(admin, "/api/admin/maintenance", {"mode": "panic"}).status_code == 422
    assert put(admin, "/api/admin/maintenance", {"mode": "off", "until": "soon"}).status_code == 422
    ok = put(admin, "/api/admin/maintenance", {"mode": "read_only", "until": "2026-10-13T20:00:00+05:30"})
    assert ok.json()["until"] == "2026-10-13T14:30:00Z"
    assert put(admin, "/api/admin/maintenance", {"mode": "off", "message": "x" * 501}).status_code == 422


def test_other_instance_change_is_seen_within_60_s(admin: TestClient) -> None:
    rt = runtime(admin)
    mono = [1000.0]
    rt.site._now = lambda: mono[0]  # type: ignore[method-assign]
    rt.site.invalidate()
    admin.get("/api/me")
    store(admin).put_setting(
        "settings",
        {"maintenance": {"mode": "read_only"}, "tz": "Asia/Kolkata", "notice": None},
        expect_version=None,
    )
    mono[0] += 59
    assert admin.get("/api/me").json()["maintenance"]["mode"] == "off"
    mono[0] += 2
    assert admin.get("/api/me").json()["maintenance"]["mode"] == "read_only"


# -- §19 settings --------------------------------------------------------------------------------------


def test_settings(admin: TestClient) -> None:
    assert admin.get("/api/admin/settings").json() == {"tz": "Asia/Kolkata", "notice": None, "version": 0}
    response = put(admin, "/api/admin/settings", {"tz": "Europe/London", "notice": "New hubs!"})
    assert response.json() == {"tz": "Europe/London", "notice": "New hubs!", "version": 1}
    assert put(admin, "/api/admin/settings", {"tz": "Mars/Base"}).status_code == 422
    assert put(admin, "/api/admin/settings", {"notice": None, "version": 0}).status_code == 409
    assert put(admin, "/api/admin/settings", {"notice": None, "version": 1}).json()["notice"] is None
    put(admin, "/api/admin/maintenance", {"mode": "read_only"})
    assert admin.get("/api/admin/settings").json()["tz"] == "Europe/London"  # one doc, both kept


# -- §19 jobs ------------------------------------------------------------------------------------------


def test_jobs_lifecycle(admin: TestClient) -> None:
    rt = runtime(admin)
    created = post(
        admin,
        "/api/admin/jobs",
        {
            "kind": "maintenance",
            "mode": "read_only",
            "startAt": "tonight",
            "tz": "Asia/Kolkata",
            "durationMin": 30,
        },
    )
    assert created.status_code == 201
    job = created.json()["job"]
    now = rt.clock.now()
    assert job["state"] == "scheduled"
    assert job["startAt"].endswith("T18:30:00Z")  # 00:00 IST
    assert datetime.fromisoformat(job["startAt"]) > now
    assert job["createdBy"] == ADMIN
    assert admin.get(f"/api/admin/jobs/{job['id']}").json()["job"]["id"] == job["id"]
    assert [j["id"] for j in admin.get("/api/admin/jobs").json()["jobs"]] == [job["id"]]
    assert admin.get("/api/admin/stats").json()["jobs"][0]["id"] == job["id"]

    # T-10 min: /api/me carries `upcoming`; at startAt the tick applies it
    start = datetime.fromisoformat(job["startAt"])
    rt.clock.set(int((start - timedelta(minutes=5)).timestamp() * 1000))  # type: ignore[attr-defined]
    session(admin)
    upcoming = admin.get("/api/me").json()["upcoming"]
    assert upcoming == {"mode": "read_only", "startAt": job["startAt"], "message": None}
    rt.clock.set(int(start.timestamp() * 1000))  # type: ignore[attr-defined]
    session(admin)
    assert admin.post("/api/test/tick", headers={"X-StudyHubs": "1"}).json()["events"] == [
        f"started {job['id']}"
    ]
    assert admin.get("/api/me").json()["maintenance"]["mode"] == "read_only"

    # cancelling a running window ends it now and restores the previous mode
    no = post(admin, f"/api/admin/jobs/{job['id']}/cancel")
    assert no.json()["code"] == "confirm_required"
    cancelled = post(admin, f"/api/admin/jobs/{job['id']}/cancel", {"confirm": "CANCEL"})
    assert cancelled.json()["job"]["state"] == "cancelled"
    assert admin.get("/api/me").json()["maintenance"]["mode"] == "off"
    again = post(admin, f"/api/admin/jobs/{job['id']}/cancel", {"confirm": "CANCEL"})
    assert again.status_code == 409
    assert admin.get("/api/admin/jobs/nope").status_code == 404


def test_job_validation_and_full_needs_confirmation(admin: TestClient) -> None:
    base = {"kind": "maintenance", "mode": "read_only", "startAt": "2026-10-20T01:00:00Z", "durationMin": 15}
    for bad in (
        {"kind": "restore"},
        {"mode": "off"},
        {"startAt": "yesterday"},
        {"startAt": "2020-01-01T00:00:00Z"},
        {"startAt": "2027-12-01T00:00:00Z"},
        {"durationMin": 0},
        {"durationMin": "30"},
        {"tz": "Nowhere/City"},
    ):
        assert post(admin, "/api/admin/jobs", {**base, **bad}).status_code == 422, bad
    naive = post(admin, "/api/admin/jobs", {**base, "startAt": "2026-10-20T06:30:00", "tz": "Asia/Kolkata"})
    assert naive.json()["job"]["startAt"] == "2026-10-20T01:00:00Z"  # wall time in tz
    full = post(admin, "/api/admin/jobs", {**base, "mode": "full"})
    assert full.json()["code"] == "confirm_required"
    assert post(admin, "/api/admin/jobs", {**base, "mode": "full", "confirm": "FULL"}).status_code == 201
    scheduled = admin.get("/api/admin/jobs").json()["jobs"][0]
    cancel = post(admin, f"/api/admin/jobs/{scheduled['id']}/cancel", {"confirm": "CANCEL"})
    assert cancel.json()["job"]["state"] == "cancelled"


# -- §19 backups ---------------------------------------------------------------------------------------


def seed_learners(client: TestClient, n: int = 3) -> None:
    for i in range(n):
        sign_in(client, f"learner-{i}")
        sync(client, {"ai103": {"main": main(done=i + 1)}})
    session(client)


def download(client: TestClient, body: dict[str, Any]) -> tuple[dict[str, Any], bytes]:
    response = post(client, "/api/admin/backups", body)
    assert response.status_code == 200, response.text
    created = response.json()
    assert created["expiresIn"] == 120
    assert created["filename"].endswith(".backup")
    got = client.get(f"/api/admin/backups/{created['ticket']}")
    assert got.status_code == 200, got.text
    assert got.headers["content-type"] == "application/octet-stream"
    assert got.headers["cache-control"] == "no-store"
    assert created["filename"] in got.headers["content-disposition"]
    assert "content-encoding" not in got.headers
    return created, got.content


def verify(path: Path, passphrase: str | None = None) -> dict[str, Any]:
    env = {"PATH": ""}
    if passphrase:
        env["BACKUP_PASSPHRASE"] = passphrase
    run = subprocess.run(  # noqa: S603 - our own script
        [sys.executable, str(TOOL), "verify", str(path)], capture_output=True, text=True, env=env, check=False
    )
    assert run.returncode == 0, run.stderr
    result: dict[str, Any] = json.loads(run.stdout)
    return result


def test_backup_estimate_download_and_log(admin: TestClient, tmp_path: Path) -> None:
    seed_learners(admin)
    estimate = admin.get("/api/admin/backups/estimate").json()
    assert estimate == {
        "users": 3,
        "docs": 3,
        "tombstones": 0,
        "estReads": 10,
        "readsLeftToday": estimate["readsLeftToday"],
        "fits": True,
    }
    created, data = download(admin, {"passphrase": None, "requireReadOnly": True, "confirm": "BACKUP"})
    path = tmp_path / created["filename"]
    path.write_bytes(data)
    summary = verify(path)
    assert summary["counts"] == {"settings": 1, "tombstone": 0, "user": 3, "progress": 3}
    assert summary["consistent"] is True
    # the run entered read_only and restored the previous mode afterwards
    assert admin.get("/api/admin/maintenance").json()["mode"] == "off"
    log = admin.get("/api/admin/backups/log").json()
    assert log == [
        {
            "at": log[0]["at"],
            "bytes": len(data),
            "fileSha256": summary["fileSha256"],
            "counts": summary["counts"],
            "encrypted": False,
            "consistent": True,
        }
    ]
    stats = admin.get("/api/admin/stats").json()
    assert stats["lastBackup"]["fileSha256"] == summary["fileSha256"]
    assert stats["firestore"]["storage"]["docs"] == 3  # recalibrated for free by the backup
    # single use
    assert admin.get(f"/api/admin/backups/{created['ticket']}").status_code == 404

    created, data = download(
        admin, {"passphrase": "a long passphrase", "requireReadOnly": False, "confirm": "BACKUP"}
    )
    path.write_bytes(data)
    summary = verify(path, "a long passphrase")
    assert (summary["encrypted"], summary["consistent"]) == (True, False)
    assert [entry["encrypted"] for entry in admin.get("/api/admin/backups/log").json()] == [True, False]


def test_backup_ticket_rules(admin: TestClient, make_client: Any, clock: FixedClock) -> None:
    body = {"requireReadOnly": False, "confirm": "BACKUP"}
    assert post(admin, "/api/admin/backups", {**body, "passphrase": "short"}).status_code == 422
    assert post(admin, "/api/admin/backups", {**body, "requireReadOnly": "yes"}).status_code == 422
    ticket = post(admin, "/api/admin/backups", body).json()["ticket"]
    session(admin, "second", email="second@example.com")  # another admin
    assert admin.get(f"/api/admin/backups/{ticket}").status_code == 404
    session(admin)
    ticket = post(admin, "/api/admin/backups", body).json()["ticket"]
    clock.advance(121_000)
    session(admin)
    assert admin.get(f"/api/admin/backups/{ticket}").status_code == 404  # expired
    admin.post("/api/test/quota", json={"reads": 49_995}, headers={"X-StudyHubs": "1"})
    refused = post(admin, "/api/admin/backups", body)
    assert refused.status_code == 409
    assert refused.json()["code"] == "quota"
    assert admin.get("/api/admin/backups/estimate").json()["fits"] is False


def test_backup_restores_mode_when_the_client_leaves(admin: TestClient) -> None:
    seed_learners(admin, 2)
    ticket = post(admin, "/api/admin/backups", {"requireReadOnly": True, "confirm": "BACKUP"}).json()[
        "ticket"
    ]
    with admin.stream("GET", f"/api/admin/backups/{ticket}") as response:
        assert response.status_code == 200
        next(response.iter_bytes())
    assert admin.get("/api/admin/maintenance").json()["mode"] == "off"
    assert runtime(admin).backups.running is False


def test_backup_in_read_only_already_is_consistent(admin: TestClient, tmp_path: Path) -> None:
    put(admin, "/api/admin/maintenance", {"mode": "read_only", "message": "Planned"})
    _, data = download(admin, {"requireReadOnly": False, "confirm": "BACKUP"})
    path = tmp_path / "x.backup"
    path.write_bytes(data)
    assert verify(path)["consistent"] is True
    assert admin.get("/api/admin/maintenance").json()["message"] == "Planned"  # untouched


def test_backup_read_only_survives_a_racing_settings_write(admin: TestClient, tmp_path: Path) -> None:
    """Another instance writes meta/settings while the backup enters read-only: the write is
    retried, the file is consistent, and the mode the backup replaced comes back after it."""
    seed_learners(admin, 2)
    put(admin, "/api/admin/settings", {"notice": "Before"})
    store(admin).fail_next("put_setting", Conflict("another instance wrote first"))
    _, data = download(admin, {"requireReadOnly": True, "confirm": "BACKUP"})
    path = tmp_path / "x.backup"
    path.write_bytes(data)
    assert verify(path)["consistent"] is True
    assert admin.get("/api/admin/maintenance").json()["mode"] == "off"


def test_backup_that_cannot_enter_read_only_leaves_the_mode_alone(admin: TestClient) -> None:
    seed_learners(admin, 1)
    ticket = post(admin, "/api/admin/backups", {"requireReadOnly": True, "confirm": "BACKUP"}).json()[
        "ticket"
    ]
    store(admin).fail_next("put_setting", Unavailable("blip"))
    with pytest.raises(Unavailable):
        admin.get(f"/api/admin/backups/{ticket}")
    # An admin sets read-only for other reasons; the failed backup must not undo it later.
    put(admin, "/api/admin/maintenance", {"mode": "read_only", "message": "Admin's own"})
    assert runtime(admin).backups.running is False
    assert admin.get("/api/admin/maintenance").json()["message"] == "Admin's own"


def test_now_is_inside_the_valid_range() -> None:
    assert datetime.fromtimestamp(NOW_MS / 1000, UTC).year == 2026
