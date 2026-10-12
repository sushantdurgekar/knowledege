"""/healthz, /api/version, /api/me, /api/seed/{id}.js, unknown /api/*, error shape, /api gzip."""

from __future__ import annotations

import gzip
import tomllib
from pathlib import Path

import pytest
from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from app import __version__
from app.errors import ApiError
from tests.support import fetch

SEED_BODY = "window.__studyhubsBridge&&__studyhubsBridge.legacySeed({signedIn:false});"


def test_healthz(client: TestClient) -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert response.headers["cache-control"] == "no-store"
    head = client.head("/healthz")
    assert head.status_code == 200
    assert head.content == b""


def test_version(client: TestClient) -> None:
    response = client.get("/api/version")
    assert response.status_code == 200
    assert response.json() == {"version": "0.1.0", "commit": "abc1234"}
    assert response.headers["cache-control"] == "no-store"


def test_version_matches_pyproject() -> None:
    pyproject = tomllib.loads((Path(__file__).parents[1] / "pyproject.toml").read_text())
    assert pyproject["project"]["version"] == __version__ == "0.1.0"


def test_me_is_anonymous(client: TestClient) -> None:
    client.cookies.set("sh_hint", "someone")  # a hint cookie alone never signs anyone in
    response = client.get("/api/me")
    assert response.status_code == 200
    assert response.json() == {"signedIn": False}
    assert response.headers["cache-control"] == "no-store"


def test_seed_for_legacy_hub(client: TestClient) -> None:
    response = client.get("/api/seed/ai901.js")
    assert response.status_code == 200
    assert response.text == SEED_BODY
    assert response.headers["content-type"] == "text/javascript; charset=utf-8"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["vary"] == "Cookie"


@pytest.mark.parametrize(
    "url",
    [
        "/api/seed/ai103.js",
        "/api/seed/nope.js",
        "/api/seed/ai-901.js",
        "/api/seed/ai901.js.js",
        "/api/seed/AI901.js",
    ],
)
def test_seed_unknown_or_non_legacy_is_404_js(client: TestClient, url: str) -> None:
    response = client.get(url)
    assert response.status_code == 404
    assert response.headers["content-type"] == "text/javascript; charset=utf-8"
    assert response.text.startswith("/*")
    assert response.text.rstrip().endswith("*/")
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["vary"] == "Cookie"


@pytest.mark.parametrize(
    ("method", "url"),
    [
        ("GET", "/api"),
        ("GET", "/api/"),
        ("GET", "/api/nope"),
        ("GET", "/api/me/"),
        ("GET", "/api/seed/ai901"),
        ("GET", "/api/progress"),  # M1: /api/progress/{hubId} and POST /api/sync exist
        ("POST", "/api/sync/x"),
        ("PUT", "/api/nope"),
        ("DELETE", "/api/me/x"),
        ("OPTIONS", "/api/nope"),
    ],
)
def test_unknown_api_is_json_404(client: TestClient, method: str, url: str) -> None:
    response = client.request(method, url)
    assert response.status_code == 404
    assert response.headers["content-type"] == "application/json"
    assert response.json() == {"code": "not_found", "message": "No such API endpoint"}
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize(
    ("method", "url", "allow"),
    [
        ("POST", "/api/version", "GET"),
        ("DELETE", "/api/me", "GET"),
        ("HEAD", "/api/me", "GET"),
        ("PUT", "/api/seed/ai901.js", "GET"),
        ("POST", "/healthz", "GET, HEAD"),
    ],
)
def test_known_path_wrong_method_is_json_405(client: TestClient, method: str, url: str, allow: str) -> None:
    response = client.request(method, url)
    assert response.status_code == 405
    assert set(response.headers["allow"].split(", ")) == set(allow.split(", "))
    if method != "HEAD":
        assert response.json() == {"code": "method_not_allowed", "message": "Method Not Allowed"}


def _add_route(client: TestClient, path: str, endpoint) -> None:
    # Register an extra route on the running app, as an M1 router would add one.
    client.app.router.routes.insert(0, APIRoute(path, endpoint))  # type: ignore[attr-defined]


def test_api_error_shape_with_retry_after(client: TestClient) -> None:
    async def paused() -> JSONResponse:
        raise ApiError(429, "sync_paused", "Sync is paused until the quota resets", retry_after=3600)

    _add_route(client, "/api/test-paused", paused)
    response = client.get("/api/test-paused")
    assert response.status_code == 429
    assert response.json() == {
        "code": "sync_paused",
        "message": "Sync is paused until the quota resets",
        "retryAfter": 3600,
    }
    assert response.headers["retry-after"] == "3600"
    assert response.headers["cache-control"] == "no-store"


def test_validation_error_shape(client: TestClient) -> None:
    async def needs_int(n: int) -> JSONResponse:
        return JSONResponse({"n": n})

    _add_route(client, "/api/test-int", needs_int)
    response = client.get("/api/test-int?n=abc")
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "invalid"
    assert body["message"].startswith("Invalid request: query.n")
    assert "abc" not in body["message"]


def test_unhandled_error_is_json_500_with_security_headers(make_client) -> None:
    # ServerErrorMiddleware sends the 500 and then re-raises; look at the response instead.
    client: TestClient = make_client(raise_server_exceptions=False)

    async def boom() -> JSONResponse:
        raise RuntimeError("secret internal detail")

    _add_route(client, "/api/test-boom", boom)
    response = client.get("/api/test-boom")
    assert response.status_code == 500
    assert response.json() == {"code": "internal", "message": "Internal server error"}
    assert "secret" not in response.text
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["cross-origin-opener-policy"] == "same-origin-allow-popups"


def test_api_json_is_gzipped_above_threshold(client: TestClient) -> None:
    async def big(request: Request) -> JSONResponse:
        return JSONResponse({"items": ["x" * 40] * 100})

    _add_route(client, "/api/test-big", big)
    response, raw = fetch(client, "/api/test-big", accept_encoding="gzip")
    assert response.headers["content-encoding"] == "gzip"
    assert b'"items"' in gzip.decompress(raw)
    assert "Accept-Encoding" in response.headers["vary"]

    small, raw_small = fetch(client, "/api/version", accept_encoding="gzip")
    assert "content-encoding" not in small.headers  # below minimum_size
    assert raw_small.startswith(b"{")


def test_hub_and_shell_responses_are_never_gzipped_on_the_fly(client: TestClient) -> None:
    # The shell index.html is > 1000 bytes and has no .gz sibling: it must go out as-is.
    response, _ = fetch(client, "/", accept_encoding="gzip")
    assert "content-encoding" not in response.headers
    # A hub asked for gzip gets the collector's .gz bytes, not a gzip of the br/identity file.
    response, raw = fetch(client, "/h/ai-103", accept_encoding="gzip")
    assert response.headers["content-encoding"] == "gzip"
    assert gzip.decompress(raw).startswith(b"<!doctype html>")
