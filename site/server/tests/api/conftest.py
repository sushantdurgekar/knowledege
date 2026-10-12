"""API test helpers: fake sign-in, payload builders and access to the app's runtime.

Every client here runs APP_ENV=test with fake auth and the memory store, on the
default http origin (so the session cookie is `sh_session`).
"""

from __future__ import annotations

import gzip
import json
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.auth.fake import make_fake_token
from app.auth.identity import Identity
from app.clock import FixedClock
from app.runtime import Runtime
from app.store.memory import MemoryStore

ORIGIN = "http://127.0.0.1:10000"
API = {"X-StudyHubs": "1", "Origin": ORIGIN}
NOW_MS = 1_791_800_000_000  # 2026-10-12T...Z: inside the valid upd range
T = NOW_MS - 60_000  # a typical client stamp, a minute old


def runtime(client: TestClient) -> Runtime:
    rt: Runtime = client.app.state.studyhubs.runtime  # type: ignore[attr-defined]
    return rt


def store(client: TestClient) -> MemoryStore:
    s = runtime(client).store
    assert isinstance(s, MemoryStore)
    return s


def sign_in(
    client: TestClient,
    uid: str = "user-1",
    *,
    email: str | None = None,
    verified: bool = True,
    provider: str = "google.com",
    **extra: Any,
) -> dict[str, Any]:
    token = make_fake_token(
        uid, email or f"{uid}@example.com", emailVerified=verified, provider=provider, **extra
    )
    response = client.post("/api/auth/session", json={"idToken": token}, headers=API)
    assert response.status_code == 200, response.text
    return response.json()["user"]


def force_session(client: TestClient, uid: str = "user-1") -> None:
    """Install a valid session cookie without the sign-in route (blocked in full maintenance)."""
    identity = Identity(uid, f"{uid}@example.com", provider="google.com", email_verified=True)
    client.cookies.set("sh_session", runtime(client).auth.create_session("t", identity))


def main(hub: str = "ai103", upd: int = T, done: int = 1) -> dict[str, Any]:
    return {"hub": hub, "upd": upd, "S": {"v": 2, "done": {f"m{i}": True for i in range(done)}}}


def mocks(hub: str = "ai103", upd: int = T) -> dict[str, Any]:
    return {"hub": hub, "upd": upd, "list": [{"pct": 70}, {"pct": 85}]}


def cards(hub: str = "ai103", upd: int = T) -> dict[str, Any]:
    return {"hub": hub, "upd": upd, "map": {"c1": {"due": 3}}}


def legacy(upd: int = T, done: int = 2, extra: str = "") -> dict[str, Any]:
    raw = json.dumps({"done": {f"m{i}": True for i in range(done)}, "plan": {}, "note": extra})
    return {"hub": "ai901", "upd": upd, "key": "ai901hub.v1", "raw": raw}


def sync(client: TestClient, hubs: dict[str, Any], *, gzip_body: bool = False, headers: Any = None) -> Any:
    body = json.dumps({"hubs": hubs}).encode()
    all_headers = {**API, "Content-Type": "application/json", **(headers or {})}
    if gzip_body:
        body = gzip.compress(body)
        all_headers["Content-Encoding"] = "gzip"
    return client.post("/api/sync", content=body, headers=all_headers)


def set_cookie_headers(response: Any) -> list[str]:
    return response.headers.get_list("set-cookie")


def assert_cleared(response: Any, name: str = "sh_session") -> None:
    cookies = set_cookie_headers(response)
    assert f"{name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax" in cookies, cookies
    assert "sh_hint=; Max-Age=0; Path=/; SameSite=Lax" in cookies, cookies


@pytest.fixture
def clock() -> FixedClock:
    return FixedClock(NOW_MS)


@pytest.fixture
def api(make_client: Any, clock: FixedClock) -> TestClient:
    return make_client(clock=clock)


@pytest.fixture
def user(api: TestClient) -> dict[str, Any]:
    return sign_in(api)
