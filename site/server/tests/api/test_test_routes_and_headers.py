"""Test-only routes (section 15), shell framing headers, egress metering, error shapes."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.api.conftest import API, NOW_MS, T, main, runtime, sign_in, store, sync

TEST_HEADERS = {"X-StudyHubs": "1"}  # a test runner's request context sends no Origin


def post(client: TestClient, path: str, body: dict[str, Any] | None = None) -> Any:
    return client.post(path, json=body or {}, headers=TEST_HEADERS)


def test_test_routes_need_the_header(api: TestClient) -> None:
    for method, path in [
        ("POST", "/api/test/reset"),
        ("POST", "/api/test/faults"),
        ("POST", "/api/test/clock"),
        ("POST", "/api/test/quota"),
        ("GET", "/api/test/store"),
    ]:
        response = api.request(method, path, json={})
        assert response.status_code == 403, path
        assert response.json()["code"] == "csrf"
    cross = api.post("/api/test/reset", headers={"X-StudyHubs": "1", "Origin": "https://evil.example"})
    assert cross.status_code == 403


@pytest.mark.parametrize("app_env", ["development"])
def test_test_routes_absent_outside_test(make_client: Any, app_env: str) -> None:
    client = make_client(app_env=app_env)
    for path in ("/api/test/reset", "/api/test/store"):
        response = client.request("POST" if path.endswith("reset") else "GET", path, headers=API)
        assert response.status_code == 404
        assert response.json()["code"] == "not_found"


def test_faults_get_put_any(api: TestClient) -> None:
    sign_in(api)
    response = post(api, "/api/test/faults", {"op": "put", "status": 503, "code": "unavailable", "count": 2})
    assert response.json() == {"ok": True, "pending": 2}
    for _ in range(2):
        failed = sync(api, {"ai103": {"main": main()}})
        assert failed.status_code == 503
        assert failed.json()["code"] == "unavailable"
    assert sync(api, {"ai103": {"main": main()}}).status_code == 200

    post(api, "/api/test/faults", {"op": "get", "status": 429, "code": "sync_paused", "retryAfter": 60})
    assert sync(api, {"ai103": {"main": main(upd=T + 1)}}).status_code == 200  # put unaffected
    failed = api.get("/api/progress/ai103")
    assert failed.status_code == 429
    assert failed.headers["retry-after"] == "60"
    assert failed.json()["retryAfter"] == 60
    assert failed.json()["retryAt"].endswith("Z")

    post(api, "/api/test/faults", {"op": "any", "status": 401, "code": "unauthenticated"})
    assert api.get("/api/progress/ai103").status_code == 401
    assert api.get("/api/progress/ai103").status_code == 200


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"op": "post", "status": 503, "code": "x"},
        {"op": "get", "status": 200, "code": "x"},
        {"op": "get", "status": 503},
        {"op": "get", "status": 503, "code": "x", "count": 0},
    ],
)
def test_faults_validation(api: TestClient, body: dict[str, Any]) -> None:
    assert post(api, "/api/test/faults", body).status_code == 422


def test_clock_offset_drives_skew(api: TestClient) -> None:
    sign_in(api)
    ahead = main(upd=NOW_MS + 3_600_000)
    assert sync(api, {"ai103": {"main": ahead}}).json()["code"] == "clock_skew"
    response = post(api, "/api/test/clock", {"offsetMs": 3_600_000})
    assert response.json()["nowMs"] == NOW_MS + 3_600_000
    assert sync(api, {"ai103": {"main": ahead}}).status_code == 200
    assert post(api, "/api/test/clock", {"offsetMs": "soon"}).status_code == 422


def test_quota_route_sets_tiers(api: TestClient) -> None:
    response = post(api, "/api/test/quota", {"writes": 19_000})
    assert response.json()["today"]["writes"] == 19_000
    assert response.json()["policy"]["tier"] == "paused"
    response = post(api, "/api/test/quota", {"writes": 0, "reads": 46_000})
    assert response.json()["policy"]["tier"] == 1
    assert response.json()["policy"]["refreshMs"] == 300_000
    assert post(api, "/api/test/quota", {"writes": -1}).status_code == 422


def test_reset_wipes_everything(api: TestClient) -> None:
    sign_in(api)
    sync(api, {"ai103": {"main": main()}})
    post(api, "/api/test/faults", {"op": "any", "status": 503, "code": "unavailable", "count": 5})
    post(api, "/api/test/quota", {"writes": 19_000})
    post(api, "/api/test/clock", {"offsetMs": 5})
    assert post(api, "/api/test/reset").status_code == 204
    dump = api.get("/api/test/store", headers=TEST_HEADERS).json()
    assert dump["users"] == []
    assert dump["progress"] == []
    assert dump["meter"]["writes"] == 0
    assert len(runtime(api).faults) == 0
    assert runtime(api).clock.offset_ms == 0
    # The session cookie still verifies (it is self-contained), and sync works again.
    assert sync(api, {"ai103": {"main": main()}}).status_code == 200


def test_store_dump(api: TestClient) -> None:
    user = sign_in(api, "dumped")
    sync(api, {"ai103": {"main": main(done=2)}})
    dump = api.get("/api/test/store", headers=TEST_HEADERS).json()
    assert [u["uid"] for u in dump["users"]] == ["dumped"]
    assert dump["progress"] == [
        {
            "uid": "dumped",
            "hub": "ai103",
            "part": "main",
            "upd": T,
            "data": main(done=2),
            "rawLen": dump["progress"][0]["rawLen"],
            "done": 2,
        }
    ]
    assert user["publicId"] not in str(dump["users"])  # the dump shows uids, the API never does
    assert dump["meter"]["writes"] >= 2
    assert "usage" in dump


# -- headers -------------------------------------------------------------------------------


def test_shell_is_never_framed(api: TestClient) -> None:
    for path in ("/", "/signin", "/account", "/nope"):
        response = api.get(path)
        assert response.headers["x-frame-options"] == "DENY"
        assert response.headers["content-security-policy"] == "frame-ancestors 'none'"


def test_every_response_denies_framing(api: TestClient) -> None:
    for path in ("/api/me", "/h/ai-103", "/healthz", "/_sh/bridge.js"):
        assert api.get(path).headers["x-frame-options"] == "DENY"
    assert "frame-ancestors 'none'" in api.get("/h/ai-103").headers["content-security-policy"]


def test_no_cors_headers_anywhere(api: TestClient) -> None:
    headers = {**API, "Origin": "https://evil.example"}
    for response in (
        api.get("/api/me", headers=headers),
        api.options("/api/sync", headers=headers),
        api.post("/api/sync", json={}, headers=headers),
    ):
        assert not any(name.startswith("access-control-") for name in response.headers)


def test_app_egress_is_metered(api: TestClient) -> None:
    before = runtime(api).meter.today()["appEgress"]
    response = api.get("/h/ai-103", headers={"Accept-Encoding": "identity"})
    assert runtime(api).meter.today()["appEgress"] >= before + len(response.content)


def test_api_responses_are_no_store(api: TestClient) -> None:
    sign_in(api)
    for response in (
        api.get("/api/me"),
        api.get("/api/progress/ai103"),
        sync(api, {"ai103": {"main": main()}}),
        api.get("/api/progress/nope"),
    ):
        assert response.headers["cache-control"] == "no-store"
    assert store(api).dump()["progress"]
