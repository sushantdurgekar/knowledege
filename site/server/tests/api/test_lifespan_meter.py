"""The quota meter across the app's lifetime: loaded at boot, persisted on shutdown."""

from __future__ import annotations

import time
from typing import Any

from fastapi.testclient import TestClient

from app.clock import FixedClock
from app.config import Settings
from app.main import create_app
from app.quota.pacific import day_key
from app.store.memory import MemoryStore
from tests.api.conftest import NOW_MS, main, runtime, sign_in, sync


class PersistentStore(MemoryStore):
    """The memory store standing in for a persistent backend (the meter persists to it)."""

    kind = "persistent-test"


def _wait_loaded(client: TestClient) -> None:
    deadline = time.monotonic() + 10
    while runtime(client).meter.load_state == "pending" and time.monotonic() < deadline:
        time.sleep(0.01)
    assert runtime(client).meter.load_state == "done"


def test_meter_loads_at_boot_and_persists_on_shutdown(build: Any, public: Any) -> None:
    clock = FixedClock(NOW_MS)
    day = day_key(clock.now())
    store = PersistentStore()
    store.add_usage(day, {"writes": 1234, "reads": 50})  # an earlier boot's totals
    settings = Settings(app_env="test", public_dir=public.root, hubs_dir=build.root)

    with TestClient(create_app(settings, store=store, clock=clock)) as client:
        _wait_loaded(client)
        assert runtime(client).meter.today()["writes"] >= 1234
        sign_in(client)
        assert sync(client, {"ai103": {"main": main()}}).status_code == 200
        today = runtime(client).meter.today()
    persisted = store.dump()["usage"][day]
    assert persisted["writes"] >= 1234 + 2  # the user upsert and the hub write
    assert persisted["appEgress"] > 0
    assert persisted["writes"] <= today["writes"] + 1  # plus the shutdown persist itself

    # The next boot starts from what was persisted.
    with TestClient(create_app(settings, store=store, clock=clock)) as client:
        _wait_loaded(client)
        assert runtime(client).meter.today()["writes"] >= persisted["writes"]


def test_memory_store_meter_is_in_process_only(api: TestClient) -> None:
    assert runtime(api).meter.persist_enabled is False
    assert runtime(api).meter.load_state == "skipped"
    sign_in(api)
    sync(api, {"ai103": {"main": main()}})
    assert runtime(api).meter.persist() is False
    assert store_usage(api) == {}


def store_usage(client: TestClient) -> dict[str, Any]:
    usage: dict[str, Any] = runtime(client).store.dump()["usage"]  # type: ignore[attr-defined]
    return usage
