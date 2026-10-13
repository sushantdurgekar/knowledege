"""Account API (build-contracts.md sections 18 and 22): the per-hub listing, the export
shape, and the delete-account cascade with its tombstone, cookies and repeat safety."""

from __future__ import annotations

import gzip
import hashlib
import json
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.admin.site import Maintenance
from app.auth.identity import Identity
from app.clock import FixedClock
from app.store.base import PartIn, Unavailable, tombstone_hash
from tests.api.conftest import (
    API,
    NOW_MS,
    T,
    assert_cleared,
    cards,
    legacy,
    main,
    mocks,
    runtime,
    sign_in,
    store,
    sync,
)

DELETE = {"confirm": "DELETE"}


def delete_me(client: TestClient, body: dict[str, Any] | None = None, headers: Any = None) -> Any:
    return client.request("DELETE", "/api/me", json=DELETE if body is None else body, headers=headers or API)


def old_session(client: TestClient, uid: str, *, age_s: int) -> None:
    """A session whose sign-in happened `age_s` seconds ago."""
    rt = runtime(client)
    identity = Identity(
        uid,
        f"{uid}@example.com",
        provider="google.com",
        email_verified=True,
        auth_time=int(rt.clock.now_s()) - age_s,
    )
    client.cookies.clear()
    client.cookies.set("sh_session", rt.auth.create_session("t", identity))


def set_mode(client: TestClient, mode: str) -> None:
    runtime(client).site.set_maintenance(Maintenance(mode, None, None))


def seed_unknown_hub(client: TestClient, uid: str, hub: str = "gone-hub") -> dict[str, Any]:
    """A hub document whose hub left the catalog (only the store can hold one)."""
    payload = {"hub": hub, "upd": T, "S": {"v": 2, "done": {"a": True}}}
    raw = json.dumps(payload, separators=(",", ":")).encode()
    store(client).put_parts(uid, hub, {"main": PartIn(T, gzip.compress(raw), len(raw), 1)}, NOW_MS)
    return payload


# -- GET /api/me/progress ------------------------------------------------------------------------


def test_progress_needs_a_session(api: TestClient) -> None:
    response = api.get("/api/me/progress")
    assert response.status_code == 401
    assert response.json()["code"] == "unauthenticated"


def test_progress_lists_every_hub_with_parts_and_done(api: TestClient, user: dict[str, Any]) -> None:
    empty = api.get("/api/me/progress").json()
    assert empty["hubs"] == []
    assert isinstance(empty["joined"], str)  # the user doc's createdAt
    assert empty["joined"].endswith("Z")
    hubs = {
        "ai103": {"main": main(done=3), "mocks": mocks(), "cards": cards()},
        "ai901": {"legacy": legacy()},
    }
    assert sync(api, hubs).status_code == 200
    seed_unknown_hub(api, "user-1")
    sign_in(api, "other")  # another user's hub is never listed
    assert sync(api, {"dsa-l1": {"main": main("dsa-l1")}}).status_code == 200
    sign_in(api, "user-1")

    before = store(api).ops.snapshot()
    response = api.get("/api/me/progress")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    # One id-range query (1 read per doc) plus the user doc for `joined`.
    assert (store(api).ops.snapshot() - before).reads == 3 + 1
    listed = {h["hub"]: h for h in response.json()["hubs"]}
    assert set(listed) == {"ai103", "ai901", "gone-hub"}

    ai103 = listed["ai103"]
    assert ai103["slug"] == "ai-103"
    assert ai103["title"] == "AI-103 Study Hub"
    assert ai103["done"] == 3
    assert set(ai103["parts"]) == {"main", "mocks", "cards"}
    raw_main = json.dumps(main(done=3), separators=(",", ":"), ensure_ascii=False)
    assert ai103["parts"]["main"] == {"upd": T, "bytes": len(raw_main.encode())}
    assert all(set(p) == {"upd", "bytes"} and p["bytes"] > 0 for p in ai103["parts"].values())
    assert listed["ai901"]["done"] == 2
    assert set(listed["ai901"]["parts"]) == {"legacy"}

    gone = listed["gone-hub"]
    assert gone["slug"] is None
    assert gone["title"] is None
    assert set(gone["parts"]) == {"main"}


def test_progress_and_export_close_in_full_maintenance(api: TestClient, user: dict[str, Any]) -> None:
    set_mode(api, "full")
    for url in ("/api/me/progress", "/api/me/export"):
        response = api.get(url)
        assert response.status_code == 503, url
        assert response.json()["code"] == "maintenance"
    set_mode(api, "read_only")  # reading your own data stays open in read-only
    assert api.get("/api/me/progress").status_code == 200
    assert api.get("/api/me/export").status_code == 200


# -- GET /api/me/export --------------------------------------------------------------------------


def test_export_shape(api: TestClient) -> None:
    sign_in(api, "user-1", name="Ada", picture="https://example.com/a.png")
    hubs = {"ai103": {"main": main(done=2), "mocks": mocks()}, "ai901": {"legacy": legacy(extra="é ✓")}}
    assert sync(api, hubs).status_code == 200
    seed_unknown_hub(api, "user-1")

    response = api.get("/api/me/export")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["content-disposition"] == 'attachment; filename="studyhubs-export-20261012.json"'
    body = response.json()
    assert set(body) == {"exportedAt", "user", "progress"}
    assert body["exportedAt"].startswith("2026-10-12T")
    user = body["user"]
    assert "uid" not in user
    assert "user-1" not in user.values()  # no uid anywhere in the profile
    assert user["email"] == "user-1@example.com"
    assert user["provider"] == "google.com"
    assert user["emailVerified"] is True
    assert user["createdAt"] is not None
    assert set(user) >= {"email", "emailVerified", "name", "photo", "provider", "createdAt", "lastLoginAt"}

    rows = {(r["hub"], r["part"]): r for r in body["progress"]}
    assert set(rows) == {("ai103", "main"), ("ai103", "mocks"), ("ai901", "legacy"), ("gone-hub", "main")}
    assert all(set(r) == {"hub", "part", "upd", "data"} for r in body["progress"])
    assert rows[("ai103", "main")]["data"] == main(done=2)  # the exact payload object
    assert rows[("ai103", "mocks")]["data"] == mocks()
    assert rows[("ai901", "legacy")]["data"] == legacy(extra="é ✓")
    assert rows[("ai103", "main")]["upd"] == T


def test_export_without_data_and_rate_limit(api: TestClient, user: dict[str, Any]) -> None:
    first = api.get("/api/me/export")
    assert first.status_code == 200
    assert first.json()["progress"] == []
    for _ in range(4):
        assert api.get("/api/me/export").status_code == 200
    limited = api.get("/api/me/export")
    assert limited.status_code == 429
    assert limited.json()["code"] == "rate_limited"
    assert int(limited.headers["retry-after"]) > 0


def test_export_needs_a_verified_session(api: TestClient) -> None:
    assert api.get("/api/me/export").status_code == 401


# -- DELETE /api/me ------------------------------------------------------------------------------


def test_delete_account_cascade_and_tombstone(api: TestClient) -> None:
    sign_in(api, "keeper")
    assert sync(api, {"ai103": {"main": main()}}).status_code == 200
    sign_in(api, "user-1")
    hubs = {"ai103": {"main": main(), "mocks": mocks()}, "ai901": {"legacy": legacy()}}
    assert sync(api, hubs).status_code == 200
    s = store(api)
    assert len(s.list_hubs("user-1")) == 2
    session_cookie = api.cookies.get("sh_session")

    response = delete_me(api)
    assert response.status_code == 204, response.text
    assert response.headers["cache-control"] == "no-store"
    assert_cleared(response)

    dump = s.dump()
    assert [u["uid"] for u in dump["users"]] == ["keeper"]
    assert {p["uid"] for p in dump["progress"]} == {"keeper"}
    assert s.is_tombstoned([tombstone_hash("user-1"), tombstone_hash("keeper")]) == {tombstone_hash("user-1")}
    assert tombstone_hash("user-1") == hashlib.sha256(b"studyhubs-tombstone-v1:user-1").hexdigest()
    assert runtime(api).auth.deleted == ["user-1"]  # fake mode: the Auth step is recorded

    # The old cookie no longer signs anyone in, and sync refuses it.
    api.cookies.set("sh_session", session_cookie)
    assert api.get("/api/me").json() == {"signedIn": False}
    assert sync(api, hubs).status_code == 401

    # A fresh sign-in (fake mode reuses the uid) works again, with no old data.
    assert "user-1" in runtime(api).auth.revoked  # type: ignore[attr-defined]
    sign_in(api, "user-1")
    assert "user-1" not in runtime(api).auth.revoked  # type: ignore[attr-defined]
    assert api.get("/api/me").json()["signedIn"] is True
    assert api.get("/api/me/progress").json()["hubs"] == []


def test_delete_steps_are_safe_to_repeat(api: TestClient, user: dict[str, Any]) -> None:
    assert sync(api, {"ai103": {"main": main()}}).status_code == 200
    s = store(api)
    s.fail_next("delete_user", Unavailable("emulated outage"))
    failed = delete_me(api)
    assert failed.status_code == 503
    assert failed.json()["code"] == "unavailable"
    assert "set-cookie" not in failed.headers  # still signed in: the client can retry
    assert s.is_tombstoned([tombstone_hash("user-1")]) == {tombstone_hash("user-1")}  # step 1 ran
    assert len(s.list_hubs("user-1")) == 1

    retried = delete_me(api)
    assert retried.status_code == 204
    assert s.list_hubs("user-1") == []
    assert s.is_tombstoned([tombstone_hash("user-1")]) == {tombstone_hash("user-1")}


def test_other_device_cannot_resync_a_deleted_account(
    api: TestClient, make_client: Any, clock: FixedClock
) -> None:
    """Another device (here another server instance, sharing the store and the session
    keys) keeps a valid cookie after DELETE /api/me: its next sync is 401, signs it out,
    and recreates nothing."""
    other = make_client(store=store(api), auth=runtime(api).auth, clock=clock)
    sign_in(api, "user-1")
    sign_in(other, "user-1")
    assert sync(other, {"ai103": {"main": main()}}).status_code == 200
    assert delete_me(api).status_code == 204
    assert runtime(other).deleted_uids == set()  # the other instance was not told

    s = store(api)
    before = s.ops.snapshot()
    response = sync(other, {"ai103": {"main": main(upd=T + 1)}, "ai901": {"legacy": legacy()}})
    assert response.status_code == 401
    assert response.json() == {"code": "unauthenticated", "message": "This account was deleted"}
    assert_cleared(response)
    assert (s.ops.snapshot() - before).writes == 0
    assert (s.ops.snapshot() - before).reads == 2  # the first hub's stamps + tombstone
    dump = s.dump()
    assert [p for p in dump["progress"] if p["uid"] == "user-1"] == []
    assert [u for u in dump["users"] if u["uid"] == "user-1"] == []

    # That instance now treats the cookie as signed out without another read.
    before = s.ops.snapshot()
    assert other.get("/api/progress/ai103").json() == {"signedIn": False}
    assert (s.ops.snapshot() - before).reads == 0


def test_delete_needs_confirmation_recent_sign_in_and_csrf(api: TestClient, user: dict[str, Any]) -> None:
    limiter = runtime(api).limiter  # 3 attempts an hour: reset it between the checks
    for body in ({}, {"confirm": "delete"}, {"confirm": "DELETE "}, {"confirm": True}):
        limiter.reset()
        response = delete_me(api, body)
        assert response.status_code == 422, body
        assert response.json()["code"] == "confirm_required"
    assert api.request("DELETE", "/api/me", content=b"[1]", headers=API).status_code == 422
    limiter.reset()

    no_csrf = api.request("DELETE", "/api/me", json=DELETE, headers={"Origin": API["Origin"]})
    assert no_csrf.status_code == 403
    assert no_csrf.json()["code"] == "csrf"

    old_session(api, "user-1", age_s=24 * 3600 + 5)
    stale = delete_me(api)
    assert stale.status_code == 403
    assert stale.json()["code"] == "reauth_required"
    old_session(api, "user-1", age_s=24 * 3600 - 60)
    assert delete_me(api).status_code == 204


def test_delete_without_session_and_in_maintenance(api: TestClient) -> None:
    assert delete_me(api).status_code == 401
    sign_in(api)
    for mode in ("read_only", "full"):
        set_mode(api, mode)
        response = delete_me(api)
        assert response.status_code == 503, mode
        assert response.json()["code"] == "maintenance"
    set_mode(api, "off")
    assert delete_me(api).status_code == 204


def test_delete_rate_limit(make_client: Any, clock: FixedClock) -> None:
    client: TestClient = make_client(clock=clock)
    sign_in(client)
    for _ in range(3):
        assert delete_me(client, {"confirm": "nope"}).status_code == 422
    limited = delete_me(client)
    assert limited.status_code == 429
    assert limited.json()["code"] == "rate_limited"


@pytest.mark.parametrize("url", ["/api/me/progress", "/api/me/export"])
def test_unverified_email_is_refused(api: TestClient, url: str) -> None:
    rt = runtime(api)
    identity = Identity("u2", "u2@example.com", provider="password", email_verified=False)
    api.cookies.set("sh_session", rt.auth.create_session("t", identity))
    response = api.get(url)
    assert response.status_code == 403
    assert response.json()["code"] == "email_unverified"
