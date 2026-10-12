"""Route-table invariants: CSRF on every state-changing API route, test routes only in test."""

from __future__ import annotations

import json
from collections.abc import Iterable, Iterator
from typing import Any

import pytest

from app.auth.csrf import csrf_protect
from app.config import Settings, parse_web_config
from app.main import create_app
from app.store.memory import MemoryStore
from app.testing.routes import require_test_header
from tests.support import PROD_PROJECT_ID, PROD_SECRET_KEY, PROD_WEB_CONFIG

SAFE = {"GET", "HEAD", "OPTIONS"}


def _settings(app_env: str) -> Settings:
    if app_env == "production":
        return Settings(
            app_env="production",
            public_origin="https://study-hubs.example",
            secret_key=PROD_SECRET_KEY,
            firebase_project_id=PROD_PROJECT_ID,
            firebase_web_config=parse_web_config(json.dumps(PROD_WEB_CONFIG)),
        )
    return Settings(app_env=app_env)  # type: ignore[arg-type]


def _walk(routes: Iterable[Any]) -> Iterator[Any]:
    """Flatten FastAPI's included routers into the effective routes (path, methods, dependant)."""
    for route in routes:
        if hasattr(route, "effective_candidates"):
            yield from _walk(route.effective_candidates())
        else:
            yield route


def _api_routes(app_env: str) -> list[Any]:
    store = MemoryStore() if app_env == "production" else None
    app = create_app(_settings(app_env), store=store)
    return [r for r in _walk(app.routes) if getattr(r, "path", "").startswith("/api/")]


def _dependencies(route: Any) -> set[object]:
    return {dep.call for dep in route.dependant.dependencies}


@pytest.mark.parametrize("app_env", ["development", "test", "production"])
def test_every_state_changing_api_route_has_csrf(app_env: str) -> None:
    routes = _api_routes(app_env)
    unsafe = [r for r in routes if r.methods - SAFE]
    assert unsafe, "expected POST routes"
    for route in unsafe:
        deps = _dependencies(route)
        assert csrf_protect in deps or require_test_header in deps, route.path


@pytest.mark.parametrize("app_env", ["development", "production"])
def test_test_routes_absent_outside_test(app_env: str) -> None:
    paths = {r.path for r in _api_routes(app_env)}
    assert not any(p.startswith("/api/test") for p in paths)
    assert {"/api/sync", "/api/auth/session", "/api/progress/{hub_id}"} <= paths


def test_test_routes_present_in_test() -> None:
    paths = {r.path for r in _api_routes("test")}
    assert {
        "/api/test/faults",
        "/api/test/clock",
        "/api/test/quota",
        "/api/test/reset",
        "/api/test/store",
    } <= paths
    for route in _api_routes("test"):
        if route.path.startswith("/api/test"):
            assert require_test_header in _dependencies(route)


def test_memory_store_refuses_production() -> None:
    with pytest.raises(RuntimeError, match="production"):
        MemoryStore(app_env="production")
