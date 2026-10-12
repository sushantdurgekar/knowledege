"""FirebaseAuthenticator with firebase_admin.auth monkeypatched: exact call arguments,
error mapping and the 5-minute LRU session cache (no network)."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import pytest
from firebase_admin import auth as fb_auth
from firebase_admin import exceptions as fb_exc

from app.auth.firebase import FirebaseAuthenticator, SessionCache
from app.auth.identity import AuthError, AuthUnavailable, Identity
from app.clock import FixedClock
from app.config import Settings

NOW_MS = 1_760_000_000_000
CLAIMS = {
    "uid": "u1",
    "email": "u1@example.com",
    "email_verified": True,
    "firebase": {"sign_in_provider": "google.com"},
    "auth_time": NOW_MS // 1000 - 5,
    "exp": NOW_MS // 1000 + 3600,
}


@pytest.fixture
def clock() -> FixedClock:
    return FixedClock(NOW_MS)


@pytest.fixture
def fb(clock: FixedClock, monkeypatch: pytest.MonkeyPatch) -> FirebaseAuthenticator:
    settings = Settings(
        auth_mode="firebase", store="memory", firebase_project_id="demo-unit", session_days=14
    )
    authenticator = FirebaseAuthenticator(settings, clock)
    monkeypatch.setattr(FirebaseAuthenticator, "app", property(lambda self: "APP"))
    return authenticator


def test_verify_id_token_arguments(fb: FirebaseAuthenticator, monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[Any, ...]] = []

    def verify(token: str, **kwargs: Any) -> dict[str, Any]:
        calls.append((token, kwargs))
        return CLAIMS

    monkeypatch.setattr(fb_auth, "verify_id_token", verify)
    identity = fb.verify_id_token("tok")
    assert calls == [("tok", {"app": "APP", "check_revoked": True, "clock_skew_seconds": 10})]
    assert identity.uid == "u1"
    assert identity.provider == "google.com"


@pytest.mark.parametrize(
    ("exc", "mapped"),
    [
        (fb_auth.InvalidIdTokenError("bad"), AuthError),
        (fb_auth.ExpiredIdTokenError("old", None), AuthError),
        (fb_auth.RevokedIdTokenError("revoked"), AuthError),
        (fb_auth.UserDisabledError("disabled"), AuthError),
        (ValueError("malformed"), AuthError),
        (fb_auth.CertificateFetchError("no keys", None), AuthUnavailable),
        (fb_exc.UnavailableError("down"), AuthUnavailable),
    ],
)
def test_verify_id_token_errors(
    fb: FirebaseAuthenticator, monkeypatch: pytest.MonkeyPatch, exc: Exception, mapped: type
) -> None:
    def verify(*_: Any, **__: Any) -> dict[str, Any]:
        raise exc

    monkeypatch.setattr(fb_auth, "verify_id_token", verify)
    with pytest.raises(mapped):
        fb.verify_id_token("tok")


def test_rejects_empty_or_huge_tokens(fb: FirebaseAuthenticator) -> None:
    for token in ("", "x" * 9000):
        with pytest.raises(AuthError):
            fb.verify_id_token(token)
        with pytest.raises(AuthError):
            fb.verify_session(token)


def test_create_session_cookie(fb: FirebaseAuthenticator, monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, Any] = {}

    def create(token: str, *, expires_in: timedelta, app: Any) -> bytes:
        seen.update(token=token, expires_in=expires_in, app=app)
        return b"SESSION.JWT"

    monkeypatch.setattr(fb_auth, "create_session_cookie", create)
    assert fb.create_session("tok", Identity("u1")) == "SESSION.JWT"
    assert seen == {"token": "tok", "expires_in": timedelta(days=14), "app": "APP"}

    def broken(*_: Any, **__: Any) -> bytes:
        raise fb_exc.UnavailableError("down")

    monkeypatch.setattr(fb_auth, "create_session_cookie", broken)
    with pytest.raises(AuthUnavailable):
        fb.create_session("tok", Identity("u1"))


def test_session_check_is_cached(
    fb: FirebaseAuthenticator, monkeypatch: pytest.MonkeyPatch, clock: FixedClock
) -> None:
    calls: list[dict[str, Any]] = []

    def verify(cookie: str, **kwargs: Any) -> dict[str, Any]:
        calls.append(kwargs)
        return CLAIMS

    monkeypatch.setattr(fb_auth, "verify_session_cookie", verify)
    assert fb.verify_session("C1").uid == "u1"
    assert fb.verify_session("C1").uid == "u1"
    assert calls == [{"check_revoked": False, "app": "APP", "clock_skew_seconds": 10}]
    clock.advance(299_000)
    fb.verify_session("C1")
    assert len(calls) == 1
    clock.advance(1_000)  # 5 minutes: verified again
    fb.verify_session("C1")
    assert len(calls) == 2
    fb.forget("C1")
    fb.verify_session("C1")
    assert len(calls) == 3


def test_session_errors(fb: FirebaseAuthenticator, monkeypatch: pytest.MonkeyPatch) -> None:
    def invalid(*_: Any, **__: Any) -> dict[str, Any]:
        raise fb_auth.ExpiredSessionCookieError("expired", None)

    monkeypatch.setattr(fb_auth, "verify_session_cookie", invalid)
    with pytest.raises(AuthError):
        fb.verify_session("C2")
    assert len(fb.cache) == 0  # failures are never cached

    def down(*_: Any, **__: Any) -> dict[str, Any]:
        raise fb_auth.CertificateFetchError("no keys", None)

    monkeypatch.setattr(fb_auth, "verify_session_cookie", down)
    with pytest.raises(AuthUnavailable):
        fb.verify_session("C3")


def test_cache_respects_expiry_and_size(clock: FixedClock) -> None:
    cache = SessionCache(clock, ttl_s=300, max_entries=3)
    soon = Identity("u", expires_at=clock.now_ms() // 1000 + 10)
    cache.put("a", soon)
    assert cache.get("a") == soon
    clock.advance(10_000)
    assert cache.get("a") is None  # never past the cookie's own expiry
    for name in "bcde":
        cache.put(name, Identity(name))
    assert len(cache) == 3
    assert cache.get("b") is None  # least recently used went first
    assert cache.get("e") == Identity("e")
    assert SessionCache.key("cookie") != "cookie"  # keyed by sha256, never the cookie
    cache.clear()
    assert len(cache) == 0


def test_app_init_failure_is_unavailable(clock: FixedClock, tmp_path: Any) -> None:
    bad = tmp_path / "key.json"
    bad.write_text("{}")
    settings = Settings(
        auth_mode="firebase",
        store="memory",
        firebase_project_id="demo-unit",
        google_application_credentials=str(bad),
    )
    with pytest.raises(AuthUnavailable):
        _ = FirebaseAuthenticator(settings, clock).app
