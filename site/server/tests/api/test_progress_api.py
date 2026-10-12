"""GET /api/progress/{hubId}, POST /api/sync and the legacy seed (build-contracts.md section 10)."""

from __future__ import annotations

import gzip
import json
import random
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.auth.fake import make_fake_token
from app.auth.identity import Identity
from app.clock import FixedClock
from app.store.base import OpCounts, QuotaExhausted, TooLarge, Unavailable
from tests.api.conftest import (
    API,
    NOW_MS,
    T,
    assert_cleared,
    cards,
    force_session,
    legacy,
    main,
    mocks,
    runtime,
    sign_in,
    store,
    sync,
)

TIER1 = {"tier": 1, "flushMs": 120_000, "hiddenMinMs": 0, "refreshMs": 60_000, "pausedUntil": None}


def ops_delta(client: TestClient, before: OpCounts) -> tuple[int, int]:
    delta = store(client).ops.snapshot() - before
    return delta.reads, delta.writes


# -- GET /api/progress -------------------------------------------------------------------


def test_progress_unknown_hub_is_404(api: TestClient) -> None:
    for hub in ("nope", "ai-103", "AI103"):
        response = api.get(f"/api/progress/{hub}")
        assert response.status_code == 404
        assert response.json()["code"] == "not_found"


def test_progress_anonymous(api: TestClient) -> None:
    response = api.get("/api/progress/ai103?known=main:0")
    assert response.status_code == 200
    assert response.json() == {"signedIn": False}
    assert response.headers["cache-control"] == "no-store"


def test_progress_bad_cookie_is_anonymous_and_cleared(api: TestClient) -> None:
    api.cookies.set("sh_session", "forged.cookie")
    response = api.get("/api/progress/ai103")
    assert response.json() == {"signedIn": False}
    assert_cleared(response)


def test_progress_signed_in_empty(api: TestClient, user: dict[str, Any]) -> None:
    before = store(api).ops.snapshot()
    response = api.get("/api/progress/ai103?known=main:0,mocks:0,cards:0")
    assert response.status_code == 200
    assert response.json() == {
        "signedIn": True,
        "hub": "ai103",
        "user": {"publicId": user["publicId"]},
        "parts": {"main": None, "mocks": None, "cards": None},
        "policy": TIER1,
        "maintenance": {"mode": "off", "message": None, "until": None},
    }
    assert ops_delta(api, before) == (1, 0)


def test_progress_round_trip_and_stubs(api: TestClient, user: dict[str, Any]) -> None:
    payloads = {"main": main(upd=T + 1), "mocks": mocks(upd=T + 2), "cards": cards(upd=T + 3)}
    assert sync(api, {"ai103": payloads}).status_code == 200

    body = api.get("/api/progress/ai103").json()  # nothing known: everything, 1 read
    assert body["parts"] == payloads

    before = store(api).ops.snapshot()
    body = api.get(f"/api/progress/ai103?known=main:{T + 1},mocks:{T + 2},cards:{T + 3}").json()
    assert body["parts"] == {
        "main": {"stub": True, "upd": T + 1},
        "mocks": {"stub": True, "upd": T + 2},
        "cards": {"stub": True, "upd": T + 3},
    }
    assert ops_delta(api, before) == (1, 0)  # GET unchanged = 1 read

    before = store(api).ops.snapshot()
    body = api.get(f"/api/progress/ai103?known=main:{T},mocks:{T + 2},cards:{T + 3}").json()
    assert body["parts"]["main"] == payloads["main"]
    assert body["parts"]["mocks"] == {"stub": True, "upd": T + 2}
    assert ops_delta(api, before) == (2, 0)  # GET changed = 2 reads


def test_progress_legacy_hub(api: TestClient, user: dict[str, Any]) -> None:
    part = legacy()
    assert sync(api, {"ai901": {"legacy": part}}).json()["results"]["ai901"]["legacy"]["status"] == "accepted"
    body = api.get("/api/progress/ai901?known=legacy:0").json()
    assert body["parts"] == {"legacy": part}
    body = api.get(f"/api/progress/ai901?known=legacy:{T}").json()
    assert body["parts"] == {"legacy": {"stub": True, "upd": T}}


@pytest.mark.parametrize("known", ["main", "main:x", "bogus:1", "main:-1"])
def test_progress_bad_known(api: TestClient, user: dict[str, Any], known: str) -> None:
    response = api.get(f"/api/progress/ai103?known={known}")
    assert response.status_code == 422
    assert response.json()["code"] == "invalid"


def test_progress_users_are_isolated(api: TestClient) -> None:
    sign_in(api, "alice")
    sync(api, {"ai103": {"main": main()}})
    sign_in(api, "bob")
    assert api.get("/api/progress/ai103").json()["parts"]["main"] is None


def test_progress_maintenance(make_client: Any) -> None:
    full = make_client(maintenance_force="full")
    force_session(full)
    response = full.get("/api/progress/ai103")
    assert response.status_code == 503
    assert response.json()["code"] == "maintenance"
    assert full.get("/api/progress/nope").status_code == 404

    read_only = make_client(maintenance_force="read_only")
    sign_in(read_only)
    body = read_only.get("/api/progress/ai103").json()
    assert body["maintenance"]["mode"] == "read_only"
    assert body["maintenance"]["message"]


def test_progress_rate_limit(api: TestClient, user: dict[str, Any]) -> None:
    statuses = [api.get("/api/progress/ai103").status_code for _ in range(61)]
    assert statuses[:60] == [200] * 60
    assert statuses[60] == 429


def test_progress_store_outage_and_quota(api: TestClient, user: dict[str, Any]) -> None:
    store(api).fail_next("get_hub", Unavailable("down"))
    response = api.get("/api/progress/ai103")
    assert response.status_code == 503
    assert response.json()["code"] == "unavailable"
    assert response.headers["retry-after"] == "15"

    reset_at = datetime(2026, 10, 13, 7, tzinfo=UTC)
    store(api).fail_next("get_hub", QuotaExhausted("reads", reset_at))
    response = api.get("/api/progress/ai103")
    assert response.status_code == 503
    assert response.json()["retryAt"] >= "2026-10-13T07:00:00Z"
    reads = store(api).ops.snapshot().reads
    response = api.get("/api/progress/ai103")  # breaker open: fails fast, no store call
    assert response.status_code == 503
    assert store(api).ops.snapshot().reads == reads


# -- POST /api/sync ----------------------------------------------------------------------


def test_sync_requires_a_session(api: TestClient) -> None:
    response = sync(api, {"ai103": {"main": main()}})
    assert response.status_code == 401
    assert response.json() == {"code": "unauthenticated", "message": "Sign in to sync your progress"}


def test_sync_with_bad_cookie_clears_it(api: TestClient) -> None:
    api.cookies.set("sh_session", "forged")
    response = sync(api, {"ai103": {"main": main()}})
    assert response.status_code == 401
    assert_cleared(response)


@pytest.mark.parametrize(
    "headers",
    [{"X-StudyHubs": ""}, {"Origin": "https://evil.example"}, {"Origin": "null"}],
)
def test_sync_csrf(api: TestClient, user: dict[str, Any], headers: dict[str, str]) -> None:
    response = sync(api, {"ai103": {"main": main()}}, headers=headers)
    assert response.status_code == 403
    assert response.json()["code"] == "csrf"
    assert store(api).dump()["progress"] == []


def test_sync_unverified_session_is_403(api: TestClient) -> None:
    rt = runtime(api)
    identity = Identity("pw-user", "p@example.com", provider="password", email_verified=False)
    api.cookies.set("sh_session", rt.auth.create_session("t", identity))
    response = sync(api, {"ai103": {"main": main()}})
    assert response.status_code == 403
    assert response.json()["code"] == "email_unverified"


def test_sync_newest_wins(api: TestClient, user: dict[str, Any]) -> None:
    response = sync(api, {"ai103": {"main": main(upd=T, done=3), "mocks": mocks(upd=T)}})
    assert response.status_code == 200
    assert response.json() == {
        "results": {
            "ai103": {
                "main": {"status": "accepted", "upd": T},
                "mocks": {"status": "accepted", "upd": T},
            }
        },
        "policy": TIER1,
    }
    response = sync(api, {"ai103": {"main": main(upd=T), "mocks": mocks(upd=T - 5), "cards": cards(upd=T)}})
    assert response.json()["results"]["ai103"] == {
        "main": {"status": "duplicate", "upd": T},
        "mocks": {"status": "stale", "upd": T},  # the stored stamp
        "cards": {"status": "accepted", "upd": T},
    }
    dump = store(api).dump()["progress"]
    assert {(p["part"], p["upd"]) for p in dump} == {("main", T), ("mocks", T), ("cards", T)}
    assert {p["done"] for p in dump} == {3}


def test_sync_cost_one_read_one_write_per_hub(api: TestClient, user: dict[str, Any]) -> None:
    before = store(api).ops.snapshot()
    response = sync(api, {"ai103": {"main": main(), "mocks": mocks(), "cards": cards()}})
    assert response.status_code == 200
    assert ops_delta(api, before) == (1, 1)  # 3 parts of one hub = 1 read + 1 write
    before = store(api).ops.snapshot()
    sync(api, {"ai103": {"main": main(), "mocks": mocks(), "cards": cards()}})
    assert ops_delta(api, before) == (1, 0)  # all duplicates: no write
    before = store(api).ops.snapshot()
    sync(api, {"ai103": {"main": main(upd=T + 1)}, "ai901": {"legacy": legacy()}})
    assert ops_delta(api, before) == (2, 2)


def test_sync_rejects_bad_parts_but_keeps_good_ones(api: TestClient, user: dict[str, Any]) -> None:
    response = sync(
        api,
        {
            "ai103": {
                "main": main(hub="ai901"),  # hub mismatch
                "mocks": {"hub": "ai103", "upd": T, "list": [{}] * 41},
                "cards": cards(),
            }
        },
    )
    assert response.status_code == 200
    assert response.json()["results"]["ai103"] == {
        "main": {"status": "rejected", "upd": 0, "code": "invalid"},
        "mocks": {"status": "rejected", "upd": 0, "code": "invalid"},
        "cards": {"status": "accepted", "upd": T},
    }


def test_sync_part_too_large(make_client: Any, clock: FixedClock) -> None:
    client = make_client(clock=clock, max_part_gz=2000)
    sign_in(client)
    rng = random.Random(3)
    noise = "".join(rng.choice("abcdefghijklmnopqrstuvwxyz") for _ in range(5000))
    big = {"hub": "ai103", "upd": T, "S": {"blob": noise}}
    response = sync(client, {"ai103": {"main": big, "cards": cards()}})
    assert response.json()["results"]["ai103"] == {
        "main": {"status": "rejected", "upd": 0, "code": "too_large"},
        "cards": {"status": "accepted", "upd": T},
    }


def test_sync_store_too_large_rejects_the_hub(api: TestClient, user: dict[str, Any]) -> None:
    store(api).fail_next("put_parts", TooLarge("document too big"))
    response = sync(api, {"ai103": {"main": main(), "cards": cards()}, "ai901": {"legacy": legacy()}})
    results = response.json()["results"]
    assert results["ai103"] == {
        "main": {"status": "rejected", "upd": 0, "code": "too_large"},
        "cards": {"status": "rejected", "upd": 0, "code": "too_large"},
    }
    assert results["ai901"]["legacy"]["status"] == "accepted"


def test_sync_gzip_body(api: TestClient, user: dict[str, Any]) -> None:
    response = sync(api, {"ai103": {"main": main()}}, gzip_body=True)
    assert response.status_code == 200
    assert response.json()["results"]["ai103"]["main"]["status"] == "accepted"


def test_sync_gzip_bomb_is_413(api: TestClient, user: dict[str, Any]) -> None:
    padding = " " * (9 * 1024 * 1024)  # 9 MiB of JSON whitespace: compresses to ~9 KB
    body = gzip.compress(('{"hubs":{}' + padding + "}").encode())
    assert len(body) < 2_097_152
    response = api.post(
        "/api/sync",
        content=body,
        headers={**API, "Content-Encoding": "gzip", "Content-Type": "application/json"},
    )
    assert response.status_code == 413
    assert response.json()["code"] == "too_large"


def test_sync_body_over_max_body_is_413(make_client: Any) -> None:
    client = make_client(max_body=1000)
    sign_in(client)
    response = sync(client, {"ai103": {"main": {**main(), "pad": "x" * 2000}}})
    assert response.status_code == 413
    assert response.json() == {"code": "too_large", "message": "Request body is too large"}


@pytest.mark.parametrize(
    ("body", "status", "code"),
    [
        (b"{", 422, "invalid"),
        (b"[]", 422, "invalid"),
        (b'{"hubs": {"ai103": {"legacy": {}}}}', 422, "invalid"),
        (json.dumps({"hubs": {f"h{i}": {} for i in range(26)}}).encode(), 422, "invalid"),
        (b'{"hubs": {"nope": {}}}', 404, "not_found"),
        (json.dumps({"hubs": {"ai103": {"main": main(upd=NOW_MS + 900_001)}}}).encode(), 422, "clock_skew"),
    ],
)
def test_sync_request_errors(
    api: TestClient, user: dict[str, Any], body: bytes, status: int, code: str
) -> None:
    response = api.post("/api/sync", content=body, headers={**API, "Content-Type": "application/json"})
    assert response.status_code == status
    assert response.json()["code"] == code
    assert store(api).dump()["progress"] == []


def test_sync_clock_skew_stores_nothing(api: TestClient, user: dict[str, Any]) -> None:
    response = sync(api, {"ai901": {"legacy": legacy()}, "ai103": {"main": main(upd=NOW_MS + 86_400_000)}})
    assert response.status_code == 422
    assert response.json()["code"] == "clock_skew"
    assert store(api).dump()["progress"] == []


def test_sync_unknown_content_encoding(api: TestClient, user: dict[str, Any]) -> None:
    response = api.post("/api/sync", content=b"{}", headers={**API, "Content-Encoding": "br"})
    assert response.status_code == 415


def test_sync_paused_at_budget(api: TestClient, user: dict[str, Any]) -> None:
    runtime(api).meter.set_today(writes=19_000)
    response = sync(api, {"ai103": {"main": main()}})
    assert response.status_code == 429
    body = response.json()
    assert body["code"] == "sync_paused"
    assert body["retryAt"] == "2026-10-13T07:00:00Z"  # next Pacific midnight
    assert int(response.headers["retry-after"]) == body["retryAfter"] > 0
    assert store(api).dump()["progress"] == []
    me = api.get("/api/me").json()
    assert me["policy"]["tier"] == "paused"
    assert me["policy"]["pausedUntil"] == "2026-10-13T07:00:00Z"


@pytest.mark.parametrize(("writes", "tier"), [(9_500, 2), (15_200, 3)])
def test_sync_policy_follows_tiers(api: TestClient, user: dict[str, Any], writes: int, tier: int) -> None:
    runtime(api).meter.set_today(writes=writes)
    assert sync(api, {"ai103": {"main": main()}}).json()["policy"]["tier"] == tier


def test_sync_per_user_daily_cap(make_client: Any, clock: FixedClock) -> None:
    client = make_client(clock=clock, user_writes_per_day=2)
    sign_in(client, "capped")
    assert sync(client, {"ai103": {"main": main(upd=T)}}).status_code == 200
    second = sync(client, {"ai103": {"main": main(upd=T + 1)}})
    assert second.json()["policy"]["tier"] == "paused"
    third = sync(client, {"ai103": {"main": main(upd=T + 2)}})
    assert third.status_code == 429
    assert third.json()["code"] == "sync_paused"
    sign_in(client, "other")
    assert sync(client, {"ai103": {"main": main(upd=T + 2)}}).status_code == 200


def test_sync_rate_limit(api: TestClient, user: dict[str, Any]) -> None:
    statuses = [sync(api, {"ai103": {"main": main(upd=T + i)}}).status_code for i in range(7)]
    assert statuses == [200] * 6 + [429]
    response = sync(api, {"ai103": {"main": main(upd=T + 9)}})
    assert response.json()["code"] == "rate_limited"
    assert "retryAt" in response.json()


@pytest.mark.parametrize("mode", ["read_only", "full"])
def test_sync_maintenance(make_client: Any, mode: str) -> None:
    client = make_client(maintenance_force=mode)
    force_session(client)
    response = sync(client, {"ai103": {"main": main()}})
    assert response.status_code == 503
    assert response.json()["code"] == "maintenance"
    assert "retry-after" in response.headers


def test_sync_store_outage(api: TestClient, user: dict[str, Any]) -> None:
    store(api).fail_next("put_parts", Unavailable("down"))
    response = sync(api, {"ai103": {"main": main()}})
    assert response.status_code == 503
    assert response.json() == {
        "code": "unavailable",
        "message": "Sync is unavailable right now",
        "retryAfter": 15,
    }
    assert sync(api, {"ai103": {"main": main()}}).status_code == 200  # recovers


def test_sync_quota_exhausted_trips_breaker(api: TestClient, user: dict[str, Any]) -> None:
    reset_at = datetime(2026, 10, 13, 7, tzinfo=UTC)
    store(api).fail_next("put_parts", QuotaExhausted("writes", reset_at))
    response = sync(api, {"ai103": {"main": main()}})
    assert response.status_code == 429
    assert response.json()["code"] == "sync_paused"
    assert response.json()["retryAt"] >= "2026-10-13T07:00:00Z"
    before = store(api).ops.snapshot()
    again = sync(api, {"ai103": {"main": main()}})
    assert again.status_code == 429  # fails fast
    assert store(api).ops.snapshot() == before
    assert api.get("/api/me").json()["policy"]["tier"] == "paused"


# -- seed --------------------------------------------------------------------------------

SEED_PREFIX = "window.__studyhubsBridge&&__studyhubsBridge.legacySeed("


def seed_config(response: Any) -> dict[str, Any]:
    text = response.text
    assert text.startswith(SEED_PREFIX)
    assert text.endswith(");")
    config: dict[str, Any] = json.loads(text[len(SEED_PREFIX) : -2])
    return config


def test_seed_headers(api: TestClient) -> None:
    response = api.get("/api/seed/ai901.js")
    assert response.headers["cross-origin-resource-policy"] == "same-origin"
    assert response.headers["vary"] == "Cookie"
    assert response.headers["cache-control"] == "no-store"


def test_seed_signed_in_without_data(api: TestClient, user: dict[str, Any]) -> None:
    before = store(api).ops.snapshot()
    response = api.get("/api/seed/ai901.js")
    assert response.status_code == 200
    assert seed_config(response) == {
        "signedIn": True,
        "publicId": user["publicId"],
        "policy": TIER1,
        "parts": {},
    }
    assert ops_delta(api, before) == (1, 0)
    assert response.headers["cross-origin-resource-policy"] == "same-origin"


def test_seed_signed_in_with_data(api: TestClient, user: dict[str, Any]) -> None:
    part = legacy(extra="</script><script>alert(1)</script>\u2028")
    sync(api, {"ai901": {"legacy": part}})
    before = store(api).ops.snapshot()
    response = api.get("/api/seed/ai901.js")
    assert ops_delta(api, before) == (1, 0)  # 1 read
    assert "</script>" not in response.text
    assert "\u2028" not in response.text
    assert seed_config(response)["parts"] == {"legacy": {"upd": T, "raw": part["raw"]}}


def test_seed_bad_cookie_is_anonymous_and_cleared(api: TestClient) -> None:
    api.cookies.set("sh_session", "bad")
    response = api.get("/api/seed/ai901.js")
    assert response.text == SEED_PREFIX + "{signedIn:false});"
    assert_cleared(response)


def test_seed_failures_are_503_js(api: TestClient, make_client: Any, user: dict[str, Any]) -> None:
    store(api).fail_next("get_hub", Unavailable("down"))
    response = api.get("/api/seed/ai901.js")
    assert response.status_code == 503
    assert response.text.startswith("/*")
    assert response.headers["content-type"].startswith("text/javascript")

    full = make_client(maintenance_force="full")
    force_session(full)
    assert full.get("/api/seed/ai901.js").status_code == 503
    assert full.get("/api/seed/ai103.js").status_code == 404


def test_new_session_token_for_other_user(api: TestClient) -> None:
    token = make_fake_token("x1", emailVerified=True)
    assert api.post("/api/auth/session", json={"idToken": token}, headers=API).status_code == 200
