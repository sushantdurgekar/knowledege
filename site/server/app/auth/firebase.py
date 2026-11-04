"""Firebase Auth (AUTH_MODE=firebase): ID tokens in, session cookies out.

- `verify_id_token(check_revoked=True, clock_skew_seconds=10)` at sign-in.
- `create_session_cookie(idToken, SESSION_DAYS)`.
- `verify_session_cookie(check_revoked=False)` on each request, cached for 5 minutes
  in an LRU of at most 1000 entries keyed by the sha256 of the cookie (never the
  cookie itself), and never past the cookie's own expiry.
- Admin routes (M2): `verify_session_cookie(check_revoked=True)`, cached at most 60 s
  in a second, smaller LRU.
- `DELETE /api/me` (M2): `auth.delete_user(uid)`; a user that is already gone is fine.

The firebase_admin app is created lazily on first use, so a server with broken
credentials still starts and serves hubs. Credentials come from
GOOGLE_APPLICATION_CREDENTIALS (a Render Secret File), FIREBASE_SERVICE_ACCOUNT_B64,
or Application Default Credentials, in that order.
"""

from __future__ import annotations

import hashlib
import logging
import threading
from collections import OrderedDict
from datetime import timedelta
from typing import Any

from app.auth.identity import AuthError, AuthUnavailable, Identity, identity_from_claims
from app.clock import Clock
from app.config import Settings, decode_service_account_b64

logger = logging.getLogger(__name__)

APP_NAME = "studyhubs"
CACHE_SECONDS = 300
CACHE_MAX = 1000
STRICT_CACHE_SECONDS = 60
STRICT_CACHE_MAX = 100
CLOCK_SKEW_SECONDS = 10


class SessionCache:
    """A small thread-safe LRU of verified session cookies (sha256 -> Identity, until)."""

    def __init__(self, clock: Clock, *, ttl_s: int = CACHE_SECONDS, max_entries: int = CACHE_MAX) -> None:
        self._clock = clock
        self._ttl_s = ttl_s
        self._max = max_entries
        self._lock = threading.Lock()
        self._entries: OrderedDict[str, tuple[Identity, float]] = OrderedDict()

    @staticmethod
    def key(cookie: str) -> str:
        return hashlib.sha256(cookie.encode("utf-8", "surrogateescape")).hexdigest()

    def get(self, cookie: str) -> Identity | None:
        key = self.key(cookie)
        now = self._clock.now_s()
        with self._lock:
            found = self._entries.get(key)
            if found is None:
                return None
            identity, until = found
            if now >= until:
                del self._entries[key]
                return None
            self._entries.move_to_end(key)
            return identity

    def put(self, cookie: str, identity: Identity) -> None:
        now = self._clock.now_s()
        until = now + self._ttl_s
        if identity.expires_at is not None:
            until = min(until, float(identity.expires_at))
        if until <= now:
            return
        key = self.key(cookie)
        with self._lock:
            self._entries[key] = (identity, until)
            self._entries.move_to_end(key)
            while len(self._entries) > self._max:
                self._entries.popitem(last=False)

    def forget(self, cookie: str) -> None:
        with self._lock:
            self._entries.pop(self.key(cookie), None)

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()

    def __len__(self) -> int:
        with self._lock:
            return len(self._entries)


class FirebaseAuthenticator:
    mode = "firebase"

    def __init__(self, settings: Settings, clock: Clock) -> None:
        self._settings = settings
        self._clock = clock
        self._lock = threading.Lock()
        self._app: Any = None
        self.cache = SessionCache(clock)
        self.strict_cache = SessionCache(clock, ttl_s=STRICT_CACHE_SECONDS, max_entries=STRICT_CACHE_MAX)

    # -- app --------------------------------------------------------------------------

    def _credential(self) -> Any:
        from firebase_admin import credentials

        if self._settings.google_application_credentials:
            return credentials.Certificate(self._settings.google_application_credentials)
        if self._settings.firebase_service_account_b64:
            return credentials.Certificate(
                decode_service_account_b64(self._settings.firebase_service_account_b64)
            )
        return credentials.ApplicationDefault()

    @property
    def app(self) -> Any:
        if self._app is None:
            with self._lock:
                if self._app is None:
                    import firebase_admin

                    try:
                        self._app = firebase_admin.get_app(APP_NAME)
                    except ValueError:
                        try:
                            self._app = firebase_admin.initialize_app(
                                self._credential(),
                                {"projectId": self._settings.firebase_project_id},
                                name=APP_NAME,
                            )
                        except Exception as exc:  # bad key file, no ADC, ...
                            logger.error("Firebase Admin initialisation failed: %s", exc)
                            raise AuthUnavailable("Firebase Admin is not configured") from exc
        return self._app

    # -- tokens -------------------------------------------------------------------------

    def verify_id_token(self, id_token: str) -> Identity:
        from firebase_admin import auth, exceptions

        if not isinstance(id_token, str) or not id_token or len(id_token) > 8192:
            raise AuthError("missing or oversized ID token")
        try:
            claims = auth.verify_id_token(
                id_token, app=self.app, check_revoked=True, clock_skew_seconds=CLOCK_SKEW_SECONDS
            )
        except (auth.InvalidIdTokenError, auth.UserDisabledError, auth.UserNotFoundError, ValueError) as exc:
            raise AuthError(f"ID token rejected: {type(exc).__name__}") from exc
        except (auth.CertificateFetchError, exceptions.FirebaseError) as exc:
            raise AuthUnavailable(f"ID token check failed: {type(exc).__name__}") from exc
        return identity_from_claims(claims)

    def create_session(self, id_token: str, identity: Identity) -> str:
        from firebase_admin import auth, exceptions

        try:
            cookie = auth.create_session_cookie(
                id_token, expires_in=timedelta(days=self._settings.session_days), app=self.app
            )
        except (auth.InvalidIdTokenError, ValueError) as exc:
            raise AuthError(f"session not created: {type(exc).__name__}") from exc
        except exceptions.FirebaseError as exc:
            raise AuthUnavailable(f"session not created: {type(exc).__name__}") from exc
        return cookie.decode("ascii") if isinstance(cookie, bytes) else str(cookie)

    def verify_session(self, cookie: str) -> Identity:
        from firebase_admin import auth, exceptions

        cached = self.cache.get(cookie)
        if cached is not None:
            return cached
        if not cookie or len(cookie) > 8192:
            raise AuthError("missing or oversized session cookie")
        try:
            claims = auth.verify_session_cookie(
                cookie, check_revoked=False, app=self.app, clock_skew_seconds=CLOCK_SKEW_SECONDS
            )
        except (auth.InvalidSessionCookieError, ValueError) as exc:
            raise AuthError(f"session cookie rejected: {type(exc).__name__}") from exc
        except (auth.CertificateFetchError, exceptions.FirebaseError) as exc:
            raise AuthUnavailable(f"session check failed: {type(exc).__name__}") from exc
        identity = identity_from_claims(claims)
        self.cache.put(cookie, identity)
        return identity

    def verify_session_strict(self, cookie: str) -> Identity:
        from firebase_admin import auth, exceptions

        cached = self.strict_cache.get(cookie)
        if cached is not None:
            return cached
        if not cookie or len(cookie) > 8192:
            raise AuthError("missing or oversized session cookie")
        try:
            claims = auth.verify_session_cookie(
                cookie, check_revoked=True, app=self.app, clock_skew_seconds=CLOCK_SKEW_SECONDS
            )
        except (
            auth.InvalidSessionCookieError,
            auth.UserDisabledError,
            auth.UserNotFoundError,
            ValueError,
        ) as exc:  # RevokedSessionCookieError is an InvalidSessionCookieError
            raise AuthError(f"session cookie rejected: {type(exc).__name__}", code="revoked") from exc
        except (auth.CertificateFetchError, exceptions.FirebaseError) as exc:
            raise AuthUnavailable(f"session check failed: {type(exc).__name__}") from exc
        identity = identity_from_claims(claims)
        self.strict_cache.put(cookie, identity)
        return identity

    def delete_user(self, uid: str) -> None:
        from firebase_admin import auth, exceptions

        try:
            auth.delete_user(uid, app=self.app)
        except auth.UserNotFoundError:
            return  # already deleted: the step is safe to repeat
        except exceptions.FirebaseError as exc:
            raise AuthUnavailable(f"Auth user not deleted: {type(exc).__name__}") from exc

    def forget(self, cookie: str) -> None:
        self.cache.forget(cookie)
        self.strict_cache.forget(cookie)

    def clear_cache(self) -> None:
        self.cache.clear()
        self.strict_cache.clear()
