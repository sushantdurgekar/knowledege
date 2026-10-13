"""What every authenticator returns and raises (Firebase in production, fake in tests).

An `Identity` is the signed-in user as the server sees it: built from verified ID
token or session cookie claims, never from anything the browser merely asserts.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Protocol

# Firebase uids are at most 128 characters; Firestore document ids may not contain
# "/", and "~" separates uid and hub in `progress/{uid}~{hubId}`.
UID_RE = re.compile(r"[A-Za-z0-9_.:@+-]{1,128}")


class AuthError(Exception):
    """The token or cookie is not valid (expired, revoked, forged, malformed)."""

    def __init__(self, message: str = "invalid token", code: str = "invalid_token") -> None:
        super().__init__(message)
        self.code = code


class AuthUnavailable(Exception):  # noqa: N818 - mirrors store.Unavailable
    """The check could not run (Google key fetch or revocation lookup failed)."""


@dataclass(frozen=True, slots=True)
class Identity:
    uid: str
    email: str | None = None
    name: str | None = None
    photo: str | None = None
    provider: str | None = None  # firebase.sign_in_provider: "google.com", "password", ...
    email_verified: bool = False
    auth_time: int | None = None  # seconds since the epoch of the actual sign-in
    expires_at: int | None = None  # seconds since the epoch (session cookies only)

    @property
    def needs_verification(self) -> bool:
        """Password accounts get no session (and no sync) until the email is verified."""
        return self.provider == "password" and not self.email_verified

    def profile(self, public_id: str) -> dict[str, Any]:
        """The `user` object of /api/me and /api/auth/session (no raw uid)."""
        return {
            "publicId": public_id,
            "email": self.email,
            "name": self.name,
            "photo": self.photo,
            "provider": self.provider,
            "emailVerified": self.email_verified,
        }


def valid_uid(uid: object) -> bool:
    return isinstance(uid, str) and UID_RE.fullmatch(uid) is not None


def identity_from_claims(claims: dict[str, Any]) -> Identity:
    """Map Firebase ID-token / session-cookie claims onto an Identity."""
    uid = claims.get("uid") or claims.get("sub")
    if not valid_uid(uid):
        raise AuthError("token has no usable uid")
    firebase = claims.get("firebase")
    provider = firebase.get("sign_in_provider") if isinstance(firebase, dict) else None

    def text(name: str) -> str | None:
        value = claims.get(name)
        return value if isinstance(value, str) and value else None

    def number(name: str) -> int | None:
        value = claims.get(name)
        return int(value) if isinstance(value, int | float) and not isinstance(value, bool) else None

    return Identity(
        uid=str(uid),
        email=text("email"),
        name=text("name"),
        photo=text("picture"),
        provider=provider if isinstance(provider, str) else None,
        email_verified=claims.get("email_verified") is True,
        auth_time=number("auth_time"),
        expires_at=number("exp"),
    )


class Authenticator(Protocol):
    mode: str

    def verify_id_token(self, id_token: str) -> Identity: ...

    def create_session(self, id_token: str, identity: Identity) -> str: ...

    def verify_session(self, cookie: str) -> Identity: ...

    # M2: admin routes re-check the session against revocation (cached at most 60 s),
    # and DELETE /api/me removes the Auth user (idempotent: a missing user is fine).
    def verify_session_strict(self, cookie: str) -> Identity: ...

    def delete_user(self, uid: str) -> None: ...

    def forget(self, cookie: str) -> None: ...

    def clear_cache(self) -> None: ...
