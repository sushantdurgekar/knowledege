"""Fake auth (AUTH_MODE=fake; refused in production): how tests and local dev sign in.

ID token:  "fake:" + base64url(JSON {uid, email, name?, emailVerified?, provider?, photo?, authTime?})
           provider defaults to "password", emailVerified to false and authTime
           (seconds) to now, so a fake token runs the same checks as a real one
           (an unverified password account gets 403 email_unverified).
Session:   base64url(JSON {uid, email, name, photo, provider, emailVerified, authTime, iat, exp})
           + "." + base64url(HMAC-SHA256(SECRET_KEY, "fake-session:" + first part))
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
from typing import Any

from app.auth.identity import AuthError, Identity, valid_uid
from app.clock import Clock

PREFIX = "fake:"
MAX_TOKEN = 4096
SESSION_CONTEXT = b"fake-session:"


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def b64url_decode(text: str) -> bytes:
    if not isinstance(text, str) or not text.isascii():
        raise ValueError("not base64url")
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def make_fake_token(uid: str, email: str | None = None, **extra: Any) -> str:
    """Build a fake ID token (tests, and the client's fake-mode sign-in form)."""
    body = {"uid": uid, "email": email, **extra}
    return PREFIX + b64url(json.dumps(body, separators=(",", ":")).encode())


def _text(data: dict[str, Any], name: str, limit: int = 512) -> str | None:
    value = data.get(name)
    if value is None or value == "":
        return None
    if not isinstance(value, str) or len(value) > limit:
        raise AuthError(f"fake token field {name} is invalid")
    return value


class FakeAuthenticator:
    mode = "fake"

    def __init__(self, secret: bytes, clock: Clock, *, session_days: int) -> None:
        self._secret = secret
        self._clock = clock
        self._session_s = session_days * 86400
        # Fake "revocation" for the admin re-check (tests revoke a uid; delete_user does too).
        self.revoked: set[str] = set()
        self.deleted: list[str] = []

    def verify_id_token(self, id_token: str) -> Identity:
        if not isinstance(id_token, str) or not id_token.startswith(PREFIX) or len(id_token) > MAX_TOKEN:
            raise AuthError("not a fake ID token")
        try:
            data = json.loads(b64url_decode(id_token[len(PREFIX) :]))
        except (ValueError, binascii.Error, UnicodeDecodeError) as exc:
            raise AuthError("fake ID token is not base64url JSON") from exc
        if not isinstance(data, dict) or not valid_uid(data.get("uid")):
            raise AuthError("fake ID token needs a uid")
        verified = data.get("emailVerified", False)
        auth_time = data.get("authTime")
        if not isinstance(verified, bool):
            raise AuthError("fake token field emailVerified must be a boolean")
        if auth_time is not None and (not isinstance(auth_time, int) or isinstance(auth_time, bool)):
            raise AuthError("fake token field authTime must be an integer (seconds)")
        return Identity(
            uid=data["uid"],
            email=_text(data, "email"),
            name=_text(data, "name"),
            photo=_text(data, "photo", 2048),
            provider=_text(data, "provider", 64) or "password",
            email_verified=verified,
            auth_time=int(auth_time) if auth_time is not None else int(self._clock.now_s()),
        )

    def _sign(self, payload: str) -> str:
        mac = hmac.new(self._secret, SESSION_CONTEXT + payload.encode("ascii"), hashlib.sha256)
        return b64url(mac.digest())

    def create_session(self, id_token: str, identity: Identity) -> str:
        now = int(self._clock.now_s())
        self.revoked.discard(identity.uid)  # a new sign-in (fake mode reuses a deleted uid)
        body = {
            "uid": identity.uid,
            "email": identity.email,
            "name": identity.name,
            "photo": identity.photo,
            "provider": identity.provider,
            "emailVerified": identity.email_verified,
            "authTime": identity.auth_time,
            "iat": now,
            "exp": now + self._session_s,
        }
        payload = b64url(json.dumps(body, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
        return f"{payload}.{self._sign(payload)}"

    def verify_session(self, cookie: str) -> Identity:
        if not isinstance(cookie, str) or len(cookie) > 8192 or cookie.count(".") != 1:
            raise AuthError("malformed fake session")
        payload, signature = cookie.split(".")
        try:
            expected = self._sign(payload)
        except UnicodeEncodeError as exc:
            raise AuthError("malformed fake session") from exc
        if not hmac.compare_digest(expected.encode(), signature.encode("utf-8", "surrogateescape")):
            raise AuthError("bad fake session signature")
        try:
            data = json.loads(b64url_decode(payload))
        except (ValueError, binascii.Error, UnicodeDecodeError) as exc:
            raise AuthError("malformed fake session") from exc
        if not isinstance(data, dict) or not valid_uid(data.get("uid")):
            raise AuthError("malformed fake session")
        exp = data.get("exp")
        if not isinstance(exp, int) or exp <= self._clock.now_s():
            raise AuthError("fake session expired")
        return Identity(
            uid=data["uid"],
            email=data.get("email"),
            name=data.get("name"),
            photo=data.get("photo"),
            provider=data.get("provider"),
            email_verified=data.get("emailVerified") is True,
            auth_time=data.get("authTime"),
            expires_at=exp,
        )

    def verify_session_strict(self, cookie: str) -> Identity:
        identity = self.verify_session(cookie)
        if identity.uid in self.revoked:
            raise AuthError("fake session revoked", code="revoked")
        return identity

    def delete_user(self, uid: str) -> None:
        """No Auth user to delete in fake mode; remembered for tests, and its sessions revoked."""
        self.deleted.append(uid)
        self.revoked.add(uid)

    def forget(self, cookie: str) -> None:
        return None

    def clear_cache(self) -> None:
        self.revoked.clear()
        self.deleted.clear()
