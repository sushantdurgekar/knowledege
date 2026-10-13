"""The sync API end to end on each adapter (memory, and the Firestore emulator when set)."""

from __future__ import annotations

import time
from typing import Any

from app.clock import FixedClock
from tests.api.conftest import NOW_MS, T, cards, legacy, main, mocks, runtime, sign_in, sync
from tests.contract.conftest import Adapter


def test_sign_in_sync_and_read_back(adapter: Adapter, make_client: Any, uid: str) -> None:
    client = make_client(store=adapter.store, clock=FixedClock(NOW_MS))
    deadline = time.monotonic() + 10
    while runtime(client).meter.load_state == "pending" and time.monotonic() < deadline:
        time.sleep(0.01)  # the boot-time usage read runs in the background
    sign_in(client, uid)
    payloads = {"main": main(done=3), "mocks": mocks(), "cards": cards()}
    before = adapter.wire_counts()
    response = sync(client, {"ai103": payloads, "ai901": {"legacy": legacy()}}, gzip_body=True)
    assert response.status_code == 200
    results = response.json()["results"]
    assert {p: r["status"] for p, r in results["ai103"].items()} == dict.fromkeys(payloads, "accepted")
    reads, writes = adapter.wire_counts()
    assert (reads - before[0], writes - before[1]) == (2, 2)  # 1 read + 1 write per hub

    body = client.get("/api/progress/ai103").json()
    assert body["parts"] == payloads
    body = client.get(f"/api/progress/ai103?known=main:{T},mocks:{T},cards:{T}").json()
    assert body["parts"]["main"] == {"stub": True, "upd": T}

    again = sync(client, {"ai103": {"main": main(upd=T - 1), "cards": cards(upd=T + 1)}})
    assert again.json()["results"]["ai103"] == {
        "main": {"status": "stale", "upd": T},
        "cards": {"status": "accepted", "upd": T + 1},
    }
    seed = client.get("/api/seed/ai901.js")
    assert '"legacy":{"upd":' in seed.text


def test_test_routes_reset_and_dump_the_store(adapter: Adapter, make_client: Any, uid: str) -> None:
    """`/api/test/reset` and `/api/test/store` work on both adapters (e2e on the emulator)."""
    client = make_client(store=adapter.store, clock=FixedClock(NOW_MS))
    test_headers = {"X-StudyHubs": "1"}
    sign_in(client, uid)
    payload = main(done=2)
    assert sync(client, {"ai103": {"main": payload}}).status_code == 200

    dump = client.get("/api/test/store", headers=test_headers).json()
    mine = [
        (p["hub"], p["part"], p["upd"], p["data"], p["done"]) for p in dump["progress"] if p["uid"] == uid
    ]
    assert mine == [("ai103", "main", T, payload, 2)]
    assert uid in [u["uid"] for u in dump["users"]]
    assert dump["meter"]["writes"] >= 1

    assert client.post("/api/test/reset", headers=test_headers).status_code == 204
    after = client.get("/api/test/store", headers=test_headers).json()
    assert (after["users"], after["progress"], after["meter"]["writes"]) == ([], [], 0)
