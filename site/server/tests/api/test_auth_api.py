"""/api/config, /api/me, /api/auth/session, /api/auth/logout (build-contracts.md section 9)."""

from __future__ import annotations

import json
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.auth.fake import make_fake_token
from app.auth.session import public_id
from app.clock import FixedClock
from app.config import parse_web_config
from app.store.base import Unavailable
from tests.api.conftest import API, ORIGIN, assert_cleared, runtime, set_cookie_headers, sign_in, store
from tests.support import PROD_WEB_CONFIG

WEB = parse_web_config(json.dumps({**PROD_WEB_CONFIG, "projectId": "demo-cfg"}))


# -- /api/config ------------------------------------------------------------------------


def test_config_fake_mode(api: TestClient) -> None:
    response = api.get("/api/config")
    assert response.status_code == 200
    assert response.json() == {"authMode": "fake", "firebase": None, "origin": ORIGIN, "version": "0.1.0"}
    assert response.headers["cache-control"] == "no-cache"


def test_config_firebase_mode(make_client: Any) -> None:
    client = make_client(auth_mode="firebase", firebase_project_id="demo-cfg", firebase_web_config=WEB)
    body = client.get("/api/config").json()
    assert body["authMode"] == "firebase"
    assert body["firebase"] == {**PROD_WEB_CONFIG, "projectId": "demo-cfg"}


# -- /api/me -----------------------------------------------------------------------------


def test_me_anonymous(api: TestClient) -> None:
    response = api.get("/api/me")
    assert response.json() == {"signedIn": False}
    assert set_cookie_headers(response) == []


def test_me_signed_in(api: TestClient) -> None:
    sign_in(api, "u-me", name="Me Myself")
    before = store(api).ops.snapshot()
    response = api.get("/api/me")
    assert response.status_code == 200
    body = response.json()
    pid = public_id(runtime(api).settings.secret, "u-me")
    assert body["signedIn"] is True
    assert body["user"] == {
        "publicId": pid,
        "email": "u-me@example.com",
        "name": "Me Myself",
        "photo": None,
        "provider": "google.com",
        "emailVerified": True,
    }
    assert body["maintenance"] == {"mode": "off", "message": None, "until": None}
    assert body["policy"] == {
        "tier": 1,
        "flushMs": 120_000,
        "hiddenMinMs": 0,
        "refreshMs": 60_000,
        "pausedUntil": None,
    }
    assert 'u-me"' not in response.text  # the raw uid never leaves the server
    assert store(api).ops.snapshot() == before  # 0 store reads
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("cookie", ["garbage", "a.b", "x" * 9000])
def test_me_bad_cookie_is_anonymous_and_cleared(api: TestClient, cookie: str) -> None:
    api.cookies.set("sh_session", cookie)
    api.cookies.set("sh_hint", "whatever")
    response = api.get("/api/me")
    assert response.json() == {"signedIn": False}
    assert_cleared(response)


def test_me_hint_without_session_is_cleared(api: TestClient) -> None:
    api.cookies.set("sh_hint", "stale")
    response = api.get("/api/me")
    assert response.json() == {"signedIn": False}
    assert_cleared(response)


def test_expired_session_is_anonymous(api: TestClient, clock: FixedClock) -> None:
    sign_in(api)
    clock.advance(14 * 86400 * 1000 + 1000)
    response = api.get("/api/me")
    assert response.json() == {"signedIn": False}
    assert_cleared(response)


# -- POST /api/auth/session --------------------------------------------------------------


def test_session_sets_both_cookies(api: TestClient) -> None:
    token = make_fake_token("u1", "u1@example.com", emailVerified=True, provider="google.com")
    response = api.post("/api/auth/session", json={"idToken": token}, headers=API)
    assert response.status_code == 200
    pid = public_id(runtime(api).settings.secret, "u1")
    assert response.json()["user"]["publicId"] == pid
    session, hint = set_cookie_headers(response)
    assert session.startswith("sh_session=")
    assert session.endswith("; Max-Age=1209600; Path=/; HttpOnly; SameSite=Lax")
    assert hint == f"sh_hint={pid}; Max-Age=1209600; Path=/; SameSite=Lax"
    assert response.headers["cache-control"] == "no-store"


def test_session_on_https_uses_host_prefix_and_secure(make_client: Any) -> None:
    client = make_client(public_origin="https://study-hubs.example")
    token = make_fake_token("u1", emailVerified=True)
    response = client.post(
        "/api/auth/session",
        json={"idToken": token},
        headers={"X-StudyHubs": "1", "Origin": "https://study-hubs.example"},
    )
    assert response.status_code == 200
    session, hint = set_cookie_headers(response)
    assert session.startswith("__Host-sh_session=")
    assert session.endswith("; Path=/; HttpOnly; SameSite=Lax; Secure")
    assert hint.endswith("; Path=/; SameSite=Lax; Secure")


def test_session_records_user_once_per_day(api: TestClient, clock: FixedClock) -> None:
    sign_in(api, "u2")
    first = store(api).dump()["users"]
    assert [u["uid"] for u in first] == ["u2"]
    assert first[0]["lastLoginAt"] == first[0]["createdAt"]
    writes = store(api).ops.snapshot().writes
    clock.advance(3600 * 1000)
    sign_in(api, "u2")
    assert store(api).dump()["users"] == first  # lastLoginAt at most once per 24 h
    assert store(api).ops.snapshot().writes == writes  # and no write at all
    clock.advance(24 * 3600 * 1000)
    sign_in(api, "u2")
    assert store(api).dump()["users"][0]["lastLoginAt"] != first[0]["lastLoginAt"]


@pytest.mark.parametrize(
    ("token", "status", "code"),
    [
        ("", 401, "invalid_token"),
        ("not-a-token", 401, "invalid_token"),
        (make_fake_token("u3", emailVerified=False, provider="password"), 403, "email_unverified"),
        (make_fake_token("u3", emailVerified=True, authTime=1_000), 403, "stale_login"),
    ],
)
def test_session_refusals(api: TestClient, token: str, status: int, code: str) -> None:
    response = api.post("/api/auth/session", json={"idToken": token}, headers=API)
    assert response.status_code == status
    assert response.json()["code"] == code
    assert set(response.json()) == {"code", "message"}
    assert set_cookie_headers(response) == []
    assert store(api).dump()["users"] == []


def test_unverified_google_account_may_sign_in(api: TestClient) -> None:
    sign_in(api, "g1", verified=False, provider="google.com")


def test_recent_auth_time_is_accepted(api: TestClient, clock: FixedClock) -> None:
    sign_in(api, "u4", authTime=clock.now_ms() // 1000 - 300)


@pytest.mark.parametrize("body", [b"{", b"[]", b'{"idToken": 5}'])
def test_session_bad_body(api: TestClient, body: bytes) -> None:
    response = api.post(
        "/api/auth/session", content=body, headers={**API, "Content-Type": "application/json"}
    )
    assert response.status_code in (401, 422)
    assert response.json()["code"] in ("invalid_token", "invalid")


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Origin": ORIGIN},
        {"X-StudyHubs": "1"},
        {"X-StudyHubs": "1", "Origin": "https://evil.example"},
        {"X-StudyHubs": "1", "Sec-Fetch-Site": "cross-site"},
    ],
)
def test_session_needs_csrf_headers(api: TestClient, headers: dict[str, str]) -> None:
    token = make_fake_token("u5", emailVerified=True)
    response = api.post("/api/auth/session", json={"idToken": token}, headers=headers)
    assert response.status_code == 403
    assert response.json()["code"] == "csrf"
    assert "access-control-allow-origin" not in response.headers


def test_session_same_origin_fetch_without_origin(api: TestClient) -> None:
    token = make_fake_token("u5", emailVerified=True)
    response = api.post(
        "/api/auth/session",
        json={"idToken": token},
        headers={"X-StudyHubs": "1", "Sec-Fetch-Site": "same-origin"},
    )
    assert response.status_code == 200


def test_session_rate_limit_per_ip(make_client: Any) -> None:
    client = make_client(trusted_proxy_hops=1)
    token = make_fake_token("u6", emailVerified=True)

    def attempt(ip: str) -> Any:
        headers = {**API, "X-Forwarded-For": f"9.9.9.9, {ip}"}
        return client.post("/api/auth/session", json={"idToken": token}, headers=headers)

    assert all(attempt("1.1.1.1").status_code == 200 for _ in range(10))
    limited = attempt("1.1.1.1")
    assert limited.status_code == 429
    assert limited.json()["code"] == "rate_limited"
    assert int(limited.headers["retry-after"]) >= 1
    assert limited.json()["retryAfter"] == int(limited.headers["retry-after"])
    assert "retryAt" in limited.json()
    assert attempt("2.2.2.2").status_code == 200  # another client IP


def test_session_maintenance(make_client: Any) -> None:
    full = make_client(maintenance_force="full")
    token = make_fake_token("u7", emailVerified=True)
    response = full.post("/api/auth/session", json={"idToken": token}, headers=API)
    assert response.status_code == 503
    assert response.json()["code"] == "maintenance"
    assert "retry-after" in response.headers

    read_only = make_client(maintenance_force="read_only")
    response = read_only.post("/api/auth/session", json={"idToken": token}, headers=API)
    assert response.status_code == 200
    assert store(read_only).dump()["users"] == []  # upsert deferred


def test_session_survives_store_outage(api: TestClient) -> None:
    store(api).fail_next("upsert_user", Unavailable("down"))
    sign_in(api, "u8")
    assert api.get("/api/me").json()["signedIn"] is True


# -- POST /api/auth/logout ---------------------------------------------------------------


def test_logout_clears_cookies(api: TestClient) -> None:
    sign_in(api)
    assert api.get("/api/me").json()["signedIn"] is True
    response = api.post("/api/auth/logout", headers=API)
    assert response.status_code == 204
    assert_cleared(response)
    assert api.get("/api/me").json() == {"signedIn": False}


def test_logout_needs_csrf(api: TestClient) -> None:
    sign_in(api)
    response = api.post("/api/auth/logout")
    assert response.status_code == 403
    assert api.get("/api/me").json()["signedIn"] is True


def test_logout_when_anonymous(api: TestClient) -> None:
    response = api.post("/api/auth/logout", headers=API)
    assert response.status_code == 204
    assert_cleared(response)


def test_switching_accounts_replaces_the_session(api: TestClient) -> None:
    sign_in(api, "alice")
    sign_in(api, "bob")
    pid = public_id(runtime(api).settings.secret, "bob")
    assert api.get("/api/me").json()["user"]["publicId"] == pid
