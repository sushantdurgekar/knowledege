"""Global headers on every response type (build-contracts.md section 5, "Every response")."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

GLOBAL = {
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
}

# (method, url, expected status, expected COOP)
RESPONSES = [
    ("GET", "/", 200, "same-origin-allow-popups"),
    ("GET", "/signin", 200, "same-origin-allow-popups"),
    ("GET", "/signin/", 301, "same-origin-allow-popups"),
    ("GET", "/nope", 404, "same-origin-allow-popups"),
    ("POST", "/nope", 405, "same-origin-allow-popups"),
    ("GET", "/h/ai-103", 200, "same-origin"),
    ("HEAD", "/h/ai-103", 200, "same-origin"),
    ("GET", "/h/ai-103/", 301, "same-origin"),
    ("GET", "/h/ai103", 301, "same-origin"),
    ("GET", "/h/nope", 404, "same-origin"),
    ("GET", "/h/ai-103/download", 200, "same-origin"),
    ("GET", "/_sh/bridge.js", 200, "same-origin-allow-popups"),
    ("GET", "/_sh/nope.js", 404, "same-origin-allow-popups"),
    ("GET", "/assets/index-AbC123.js", 200, "same-origin-allow-popups"),
    ("GET", "/assets/nope.js", 404, "same-origin-allow-popups"),
    ("GET", "/catalog.json", 200, "same-origin-allow-popups"),
    ("GET", "/robots.txt", 200, "same-origin-allow-popups"),
    ("GET", "/favicon.svg", 200, "same-origin-allow-popups"),
    ("GET", "/healthz", 200, "same-origin-allow-popups"),
    ("GET", "/api/version", 200, "same-origin-allow-popups"),
    ("GET", "/api/me", 200, "same-origin-allow-popups"),
    ("GET", "/api/seed/ai901.js", 200, "same-origin-allow-popups"),
    ("GET", "/api/seed/nope.js", 404, "same-origin-allow-popups"),
    ("GET", "/api/nope", 404, "same-origin-allow-popups"),
]


@pytest.mark.parametrize(("method", "url", "status", "coop"), RESPONSES)
def test_global_headers_everywhere(client: TestClient, method: str, url: str, status: int, coop: str) -> None:
    response = client.request(method, url)
    assert response.status_code == status
    for name, value in GLOBAL.items():
        assert response.headers[name] == value, name
    assert response.headers["cross-origin-opener-policy"] == coop
    assert "strict-transport-security" not in response.headers  # APP_ENV=test


def test_304_carries_global_headers(client: TestClient) -> None:
    etag = client.get("/h/ai-103").headers["etag"]
    response = client.get("/h/ai-103", headers={"If-None-Match": etag})
    assert response.status_code == 304
    for name, value in GLOBAL.items():
        assert response.headers[name] == value


@pytest.mark.parametrize(("method", "url", "status", "coop"), RESPONSES)
def test_hsts_in_production(make_client, method: str, url: str, status: int, coop: str) -> None:
    client: TestClient = make_client(app_env="production")
    response = client.request(method, url)
    assert response.status_code == status
    assert response.headers["strict-transport-security"] == "max-age=31536000"


@pytest.mark.parametrize("env", ["development", "test"])
def test_no_hsts_outside_production(make_client, env: str) -> None:
    response = make_client(app_env=env).get("/")
    assert "strict-transport-security" not in response.headers


def test_route_headers_win_over_defaults(client: TestClient) -> None:
    # The hub route sets its own Cache-Control; the API no-store default must not leak in.
    assert (
        client.get("/h/ai-103").headers["cache-control"]
        == "public, max-age=300, stale-while-revalidate=86400"
    )
    # Exactly one value per header, never duplicated by the middleware.
    response = client.get("/api/version")
    assert response.headers.get_list("cache-control") == ["no-store"]
    assert response.headers.get_list("x-content-type-options") == ["nosniff"]
