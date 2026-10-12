"""publicId, cookie names and flags, CSRF rule, fake tokens and sessions, claims mapping."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json

import pytest

from app.auth import session as s
from app.auth.csrf import csrf_problem
from app.auth.fake import FakeAuthenticator, b64url, make_fake_token
from app.auth.identity import AuthError, Identity, identity_from_claims
from app.clock import FixedClock
from app.config import Settings

SECRET = b"unit-test-secret-key-0123456789abcdef"
HTTPS = Settings(public_origin="https://study-hubs.example")
HTTP = Settings(public_origin="http://127.0.0.1:10000")


# -- publicId --------------------------------------------------------------------------


def test_public_id_is_hmac_base64url_22() -> None:
    digest = hmac.new(SECRET, b"publicId:user-1", hashlib.sha256).digest()
    expected = base64.urlsafe_b64encode(digest).decode().rstrip("=")[:22]
    assert s.public_id(SECRET, "user-1") == expected
    assert len(expected) == 22
    assert set(expected) <= set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")


def test_public_id_differs_per_uid_and_secret() -> None:
    assert s.public_id(SECRET, "a") != s.public_id(SECRET, "b")
    assert s.public_id(SECRET, "a") != s.public_id(SECRET + b"x", "a")
    assert "user-1" not in s.public_id(SECRET, "user-1")


# -- cookies ---------------------------------------------------------------------------


def test_cookie_names() -> None:
    assert s.session_cookie_name(HTTPS) == "__Host-sh_session"
    assert s.session_cookie_name(HTTP) == "sh_session"


def test_cookie_flags_https() -> None:
    session, hint = s.session_cookie_headers(HTTPS, "SESSION", "PUBLICID")
    assert session == "__Host-sh_session=SESSION; Max-Age=1209600; Path=/; HttpOnly; SameSite=Lax; Secure"
    assert hint == "sh_hint=PUBLICID; Max-Age=1209600; Path=/; SameSite=Lax; Secure"


def test_cookie_flags_http() -> None:
    session, hint = s.session_cookie_headers(HTTP, "SESSION", "PUBLICID")
    assert session == "sh_session=SESSION; Max-Age=1209600; Path=/; HttpOnly; SameSite=Lax"
    assert hint == "sh_hint=PUBLICID; Max-Age=1209600; Path=/; SameSite=Lax"


def test_cookie_max_age_follows_session_days() -> None:
    settings = Settings(public_origin="https://x.example", session_days=3)
    session, _ = s.session_cookie_headers(settings, "v", "p")
    assert "Max-Age=259200" in session


def test_clear_cookie_headers() -> None:
    assert s.clear_cookie_headers(HTTPS) == [
        "__Host-sh_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax; Secure",
        "sh_hint=; Max-Age=0; Path=/; SameSite=Lax; Secure",
    ]
    assert s.clear_cookie_headers(HTTP)[0] == "sh_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax"


# -- CSRF --------------------------------------------------------------------------------

ORIGIN = "https://study-hubs.example"


@pytest.mark.parametrize(
    ("method", "headers", "ok"),
    [
        ("GET", {}, True),
        ("HEAD", {}, True),
        ("OPTIONS", {}, True),
        ("POST", {"x-studyhubs": "1", "origin": ORIGIN}, True),
        ("POST", {"x-studyhubs": "1", "sec-fetch-site": "same-origin"}, True),  # no Origin
        ("POST", {"origin": ORIGIN}, False),  # header missing
        ("POST", {"x-studyhubs": "2", "origin": ORIGIN}, False),
        ("POST", {"x-studyhubs": "1"}, False),  # neither Origin nor Sec-Fetch-Site
        ("POST", {"x-studyhubs": "1", "origin": "https://evil.example"}, False),
        ("POST", {"x-studyhubs": "1", "origin": "null"}, False),
        ("POST", {"x-studyhubs": "1", "origin": ORIGIN + "/"}, False),  # exact match only
        ("POST", {"x-studyhubs": "1", "origin": "http://study-hubs.example"}, False),
        (
            "POST",
            {"x-studyhubs": "1", "origin": "https://evil.example", "sec-fetch-site": "same-origin"},
            False,
        ),
        ("POST", {"x-studyhubs": "1", "sec-fetch-site": "same-site"}, False),
        ("POST", {"x-studyhubs": "1", "sec-fetch-site": "cross-site"}, False),
        ("DELETE", {"x-studyhubs": "1", "origin": ORIGIN}, True),
        ("PUT", {}, False),
    ],
)
def test_csrf_matrix(method: str, headers: dict[str, str], ok: bool) -> None:
    assert (csrf_problem(method, headers, ORIGIN) is None) is ok


# -- fake auth -----------------------------------------------------------------------------


@pytest.fixture
def clock() -> FixedClock:
    return FixedClock(1_760_000_000_000)


@pytest.fixture
def fake(clock: FixedClock) -> FakeAuthenticator:
    return FakeAuthenticator(SECRET, clock, session_days=14)


def test_fake_token_defaults(fake: FakeAuthenticator, clock: FixedClock) -> None:
    identity = fake.verify_id_token(make_fake_token("u1", "u1@example.com"))
    assert identity == Identity(
        uid="u1",
        email="u1@example.com",
        provider="password",
        email_verified=False,
        auth_time=clock.now_ms() // 1000,
    )
    assert identity.needs_verification


def test_fake_token_full(fake: FakeAuthenticator) -> None:
    token = make_fake_token(
        "g1", "g@example.com", name="Gee", emailVerified=True, provider="google.com", authTime=5
    )
    identity = fake.verify_id_token(token)
    assert (identity.name, identity.provider, identity.email_verified, identity.auth_time) == (
        "Gee",
        "google.com",
        True,
        5,
    )
    assert not identity.needs_verification


@pytest.mark.parametrize(
    "token",
    [
        "",
        "fake",
        "fake:",
        "fake:!!!",
        "real:" + b64url(b'{"uid":"u1"}'),
        "fake:" + b64url(b"[1]"),
        "fake:" + b64url(b'{"email":"x@y.z"}'),  # no uid
        "fake:" + b64url(b'{"uid":"a/b"}'),  # unsafe uid
        "fake:" + b64url(b'{"uid":"a~b"}'),
        "fake:" + b64url(json.dumps({"uid": "x" * 129}).encode()),
        "fake:" + b64url(b'{"uid":"u","emailVerified":"yes"}'),
        "fake:" + b64url(b'{"uid":"u","authTime":"now"}'),
        "fake:" + b64url(b'{"uid":"u","email":5}'),
    ],
)
def test_fake_token_rejects(fake: FakeAuthenticator, token: str) -> None:
    with pytest.raises(AuthError):
        fake.verify_id_token(token)


def test_fake_session_round_trip(fake: FakeAuthenticator, clock: FixedClock) -> None:
    identity = fake.verify_id_token(make_fake_token("u1", "u1@example.com", emailVerified=True, name="Ü"))
    cookie = fake.create_session("ignored", identity)
    back = fake.verify_session(cookie)
    assert back.uid == "u1"
    assert back.name == "Ü"
    assert back.email_verified is True
    assert back.expires_at == clock.now_ms() // 1000 + 14 * 86400


def test_fake_session_tamper_and_expiry(fake: FakeAuthenticator, clock: FixedClock) -> None:
    identity = fake.verify_id_token(make_fake_token("u1"))
    cookie = fake.create_session("t", identity)
    payload, sig = cookie.split(".")
    forged_payload = b64url(json.dumps({"uid": "admin", "exp": 9_999_999_999}).encode())
    for bad in (
        f"{forged_payload}.{sig}",
        f"{payload}.{sig[:-2]}AA",
        payload,
        f"{payload}.{sig}.x",
        "",
        "é.é",
    ):
        with pytest.raises(AuthError):
            fake.verify_session(bad)
    other = FakeAuthenticator(SECRET + b"2", clock, session_days=14)
    with pytest.raises(AuthError):
        other.verify_session(cookie)
    clock.advance(14 * 86400 * 1000)
    with pytest.raises(AuthError):
        fake.verify_session(cookie)


# -- Firebase claims ---------------------------------------------------------------------


def test_identity_from_claims() -> None:
    identity = identity_from_claims(
        {
            "uid": "abc",
            "sub": "abc",
            "email": "a@b.c",
            "email_verified": True,
            "name": "A",
            "picture": "https://x/y.png",
            "firebase": {"sign_in_provider": "google.com"},
            "auth_time": 100,
            "exp": 200,
        }
    )
    assert identity == Identity("abc", "a@b.c", "A", "https://x/y.png", "google.com", True, 100, 200)
    assert identity_from_claims({"sub": "s1"}).uid == "s1"
    with pytest.raises(AuthError):
        identity_from_claims({"email": "x"})
    with pytest.raises(AuthError):
        identity_from_claims({"uid": "a/b"})
