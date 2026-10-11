"""The server starts without a build: hubs answer 503, /healthz stays 200."""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from tests.support import FakeBuild, FakePublic


@pytest.fixture
def no_build_client(make_client, tmp_path: Path) -> TestClient:
    return make_client(hubs_dir=tmp_path / "does-not-exist")


def test_healthz_still_ok(no_build_client: TestClient) -> None:
    response = no_build_client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


@pytest.mark.parametrize(
    "url", ["/h/ai-103", "/h/ai-103/", "/h/ai-103/download", "/h/ai103", "/h/anything/else"]
)
def test_hubs_return_friendly_503(no_build_client: TestClient, url: str) -> None:
    response = no_build_client.get(url)
    assert response.status_code == 503
    assert response.headers["content-type"] == "text/html; charset=utf-8"
    assert "Hubs are being prepared" in response.text
    assert response.headers["retry-after"] == "60"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"


def test_catalog_json_503(no_build_client: TestClient) -> None:
    response = no_build_client.get("/catalog.json")
    assert response.status_code == 503
    assert response.json() == {
        "code": "unavailable",
        "message": "The hub catalog is not available yet",
        "retryAfter": 60,
    }
    assert response.headers["retry-after"] == "60"


def test_seed_503_js(no_build_client: TestClient) -> None:
    response = no_build_client.get("/api/seed/ai901.js")
    assert response.status_code == 503
    assert response.headers["content-type"] == "text/javascript; charset=utf-8"


def test_shell_and_api_unaffected(no_build_client: TestClient) -> None:
    assert no_build_client.get("/").status_code == 200
    assert no_build_client.get("/api/version").status_code == 200
    assert no_build_client.get("/_sh/bridge.js").status_code == 200


def test_unreadable_catalog_is_503(make_client, build: FakeBuild) -> None:
    (build.root / "catalog.internal.json").write_text("{not json", encoding="utf-8")
    client: TestClient = make_client()
    assert client.get("/h/ai-103").status_code == 503
    assert client.get("/healthz").status_code == 200


def test_missing_public_dir(make_client, tmp_path: Path) -> None:
    client: TestClient = make_client(public_dir=tmp_path / "no-public")
    response = client.get("/")
    assert response.status_code == 503
    assert "Study Hubs is updating" in response.text
    assert client.get("/nope").status_code == 503
    assert client.get("/_sh/bridge.js").status_code == 404
    assert client.get("/assets/index-AbC123.js").status_code == 404
    assert client.get("/robots.txt").status_code == 200  # built-in fallback
    assert client.get("/h/ai-103").status_code == 200  # hubs don't need the shell
    assert client.get("/healthz").status_code == 200


def test_build_removed_while_running(client: TestClient, build: FakeBuild) -> None:
    shutil.rmtree(build.root / "hubs" / "ai-103")
    response = client.get("/h/ai-103")
    assert response.status_code == 503
    assert response.headers["retry-after"] == "60"


def test_public_removed_while_running(client: TestClient, public: FakePublic) -> None:
    (public.root / "index.html").unlink()
    assert client.get("/signin").status_code == 503
