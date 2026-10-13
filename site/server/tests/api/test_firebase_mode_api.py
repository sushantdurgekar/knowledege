"""The M2 admin and account routes with the real FirebaseAuthenticator over a mocked
`firebase_admin.auth` (build-contracts.md sections 9, 17, 18; no network).

- Admin routes stay hidden (404, exactly an unknown /api path) for every session that is
  not a verified Google sign-in of an ADMIN_EMAILS address, and for an admin whose session
  the strict check refuses (revoked, disabled, deleted); a Firebase outage during the strict
  check is 503 for the admin only.
- `DELETE /api/me` deletes the progress, the user doc and the Firebase Auth user, writes the
  tombstone, is safe to repeat after an Auth outage, and the old cookie signs no one in.
- The export names no raw uid.
"""

from __future__ import annotations

import itertools
from typing import Any

import pytest
from fastapi.testclient import TestClient
from firebase_admin import auth as fb_auth
from firebase_admin import exceptions as fb_exc

from app.auth.firebase import FirebaseAuthenticator
from app.clock import FixedClock
from app.config import Settings
from app.store.base import tombstone_hash
from tests.api.conftest import API, legacy, main, runtime, store, sync

ADMIN = "boss@example.com"
HIDDEN = {"code": "not_found", "message": "No such API endpoint"}
UID = "Zq9RawFirebaseUid0042"  # distinctive: it must never show up in an export


class FakeFirebase:
    """Just enough of firebase_admin.auth: ID tokens, session cookies, users, revocation."""

    def __init__(self, clock: FixedClock) -> None:
        self.clock = clock
        self.tokens: dict[str, dict[str, Any]] = {}
        self.users: set[str] = set()
        self.revoked: set[str] = set()
        self.disabled: set[str] = set()
        self.deleted: list[str] = []
        self.down = False
        self.delete_down = False
        self._n = itertools.count()

    def token(
        self, uid: str, email: str, *, provider: str = "google.com", verified: bool = True, age_s: int = 30
    ) -> str:
        now = self.clock.now_s()
        token = f"tok-{uid}-{next(self._n)}"
        self.tokens[token] = {
            "uid": uid,
            "email": email,
            "email_verified": verified,
            "firebase": {"sign_in_provider": provider},
            "auth_time": int(now) - age_s,
            "exp": int(now) + 14 * 86400,
        }
        self.users.add(uid)
        return token

    def verify_id_token(self, token: str, **_: Any) -> dict[str, Any]:
        claims = self.tokens.get(token)
        if claims is None:
            raise fb_auth.InvalidIdTokenError("bad token")
        if claims["uid"] not in self.users:
            raise fb_auth.UserNotFoundError("gone")
        return claims

    def create_session_cookie(self, token: str, **_: Any) -> str:
        return "cookie-" + token

    def verify_session_cookie(self, cookie: str, *, check_revoked: bool, **_: Any) -> dict[str, Any]:
        claims = self.tokens.get(cookie.removeprefix("cookie-"))
        if claims is None:
            raise fb_auth.InvalidSessionCookieError("bad cookie")
        if check_revoked:  # what check_revoked=True adds: a lookup of the Auth user
            uid = claims["uid"]
            if self.down:
                raise fb_exc.UnavailableError("Auth is down")
            if uid not in self.users:
                raise fb_auth.UserNotFoundError("gone")
            if uid in self.disabled:
                raise fb_auth.UserDisabledError("disabled")
            if uid in self.revoked:
                raise fb_auth.RevokedSessionCookieError("revoked")
        return claims

    def delete_user(self, uid: str, **_: Any) -> None:
        if self.delete_down:
            raise fb_exc.UnavailableError("Auth is down")
        if uid not in self.users:
            raise fb_auth.UserNotFoundError("gone")
        self.users.discard(uid)
        self.deleted.append(uid)


@pytest.fixture
def firebase(clock: FixedClock, monkeypatch: pytest.MonkeyPatch) -> FakeFirebase:
    fake = FakeFirebase(clock)
    monkeypatch.setattr(FirebaseAuthenticator, "app", property(lambda self: "APP"))
    for name in ("verify_id_token", "create_session_cookie", "verify_session_cookie", "delete_user"):
        monkeypatch.setattr(fb_auth, name, getattr(fake, name))
    return fake


@pytest.fixture
def fb_client(make_client: Any, clock: FixedClock, firebase: FakeFirebase) -> TestClient:
    settings = Settings(
        auth_mode="firebase", store="memory", firebase_project_id="demo-unit", session_days=14
    )
    client: TestClient = make_client(
        clock=clock, auth=FirebaseAuthenticator(settings, clock), admin_emails=(ADMIN,)
    )
    return client


def sign_in(client: TestClient, firebase: FakeFirebase, uid: str, email: str, **kwargs: Any) -> None:
    client.cookies.clear()
    token = firebase.token(uid, email, **kwargs)
    response = client.post("/api/auth/session", json={"idToken": token}, headers=API)
    assert response.status_code == 200, response.text


def hidden(client: TestClient) -> None:
    for method, url in (
        ("get", "/api/admin/stats"),
        ("get", "/api/admin/backups/estimate"),
        ("post", "/api/admin/backups"),
        ("put", "/api/admin/maintenance"),
    ):
        response = getattr(client, method)(url)  # no CSRF headers either: still 404, not 403
        assert response.status_code == 404, (method, url)
        assert response.json() == HIDDEN


@pytest.mark.parametrize(
    ("email", "provider", "verified"),
    [
        ("pleb@example.com", "google.com", True),  # not in ADMIN_EMAILS
        (ADMIN, "password", True),  # the admin's address with a password sign-in
        (ADMIN, "google.com", False),  # unverified
        (ADMIN, "github.com", True),
        (ADMIN, "anonymous", True),
    ],
)
def test_non_admin_sessions_never_see_admin_routes(
    fb_client: TestClient, firebase: FakeFirebase, email: str, provider: str, verified: bool
) -> None:
    sign_in(fb_client, firebase, "u-other", email, provider=provider, verified=verified)
    hidden(fb_client)
    firebase.down = True  # an outage of the strict check reveals nothing to them either
    hidden(fb_client)


def test_admin_strict_check_in_firebase_mode(
    fb_client: TestClient, firebase: FakeFirebase, clock: FixedClock
) -> None:
    hidden(fb_client)  # anonymous
    sign_in(fb_client, firebase, "boss", ADMIN)
    assert fb_client.get("/api/admin/stats").status_code == 200
    assert fb_client.get("/api/me").json()["user"]["admin"] is True

    for refuse in (firebase.revoked, firebase.disabled):
        refuse.add("boss")
        clock.advance(60_000)  # the strict check is cached at most 60 s
        hidden(fb_client)
        refuse.discard("boss")
        clock.advance(60_000)
        assert fb_client.get("/api/admin/stats").status_code == 200

    firebase.down = True
    clock.advance(60_000)
    outage = fb_client.get("/api/admin/stats")
    assert outage.status_code == 503
    assert outage.json()["code"] == "unavailable"
    firebase.down = False

    firebase.users.discard("boss")  # the Auth user was deleted elsewhere
    clock.advance(60_000)
    hidden(fb_client)


def test_delete_account_in_firebase_mode(fb_client: TestClient, firebase: FakeFirebase) -> None:
    sign_in(fb_client, firebase, "keeper", "keeper@example.com")
    assert sync(fb_client, {"ai103": {"main": main()}}).status_code == 200
    sign_in(fb_client, firebase, UID, "ada@example.com")
    hubs = {"ai103": {"main": main(done=3)}, "ai901": {"legacy": legacy()}}
    assert sync(fb_client, hubs).status_code == 200
    s = store(fb_client)
    assert len(s.list_hubs(UID)) == 2

    export = fb_client.get("/api/me/export")
    assert export.status_code == 200
    assert UID not in export.text  # no raw uid anywhere, not even inside a payload
    assert len(export.json()["progress"]) == 2

    cookie = fb_client.cookies.get("sh_session")
    firebase.delete_down = True
    failed = fb_client.request("DELETE", "/api/me", json={"confirm": "DELETE"}, headers=API)
    assert failed.status_code == 503
    assert "set-cookie" not in failed.headers  # still signed in, so the user can retry
    assert UID in firebase.users

    firebase.delete_down = False
    done = fb_client.request("DELETE", "/api/me", json={"confirm": "DELETE"}, headers=API)
    assert done.status_code == 204, done.text
    assert firebase.deleted == [UID]  # the Firebase Auth user is gone
    dump = s.dump()
    assert [u["uid"] for u in dump["users"]] == ["keeper"]
    assert {p["uid"] for p in dump["progress"]} == {"keeper"}
    assert s.is_tombstoned([tombstone_hash(UID)]) == {tombstone_hash(UID)}

    # The old cookie (another tab, a copied header) signs no one in and writes nothing.
    fb_client.cookies.clear()
    fb_client.cookies.set("sh_session", cookie)
    assert fb_client.get("/api/me").json() == {"signedIn": False}
    assert sync(fb_client, {"ai103": {"main": main(done=4)}}).status_code == 401
    assert fb_client.get("/api/me/export").status_code == 401
    assert fb_client.request("DELETE", "/api/me", json={"confirm": "DELETE"}, headers=API).status_code == 401
    assert {p["uid"] for p in s.dump()["progress"]} == {"keeper"}
    # Nor can the deleted account sign in again with an old ID token.
    old_token = cookie.removeprefix("cookie-")
    assert fb_client.post("/api/auth/session", json={"idToken": old_token}, headers=API).status_code == 401
    assert runtime(fb_client).deleted_uids == {UID}
