"""Fixtures shared by every test module (helpers live in tests/support.py)."""

from __future__ import annotations

import json
from collections.abc import Callable, Iterator
from contextlib import ExitStack
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, parse_web_config
from app.main import create_app
from app.store.memory import MemoryStore
from tests.support import (
    PROD_PROJECT_ID,
    PROD_SECRET_KEY,
    PROD_WEB_CONFIG,
    SECRET_TEXT,
    FakeBuild,
    FakePublic,
    make_build,
    make_public,
)

ClientFactory = Callable[..., TestClient]


@pytest.fixture
def secret_file(tmp_path: Path) -> Path:
    path = tmp_path / "secret.txt"
    path.write_bytes(SECRET_TEXT)
    return path


@pytest.fixture
def build(tmp_path: Path) -> FakeBuild:
    return make_build(tmp_path / "build")


@pytest.fixture
def public(tmp_path: Path) -> FakePublic:
    return make_public(tmp_path / "public")


ClientFactory = Callable[..., TestClient]


@pytest.fixture
def make_client(build: FakeBuild, public: FakePublic) -> Iterator[ClientFactory]:
    """Factory: make_client(app_env="production", hubs_dir=...) -> a started TestClient.

    Keyword arguments override Settings fields; `store`, `auth` and `clock` are passed
    to create_app. `raise_server_exceptions=False` lets a test look at the 500 response
    instead of getting the exception. Production clients get the settings production
    requires and, unless a test passes its own, an in-memory store, so no test ever
    talks to a real Firestore.
    """
    with ExitStack() as stack:

        def factory(
            *,
            raise_server_exceptions: bool = True,
            store: Any = None,
            auth: Any = None,
            clock: Any = None,
            **overrides: Any,
        ) -> TestClient:
            options: dict[str, Any] = {
                "app_env": "test",
                "public_dir": public.root,
                "hubs_dir": build.root,
                "git_commit": "abc1234",
            }
            if overrides.get("app_env") == "production":
                options.update(
                    secret_key=PROD_SECRET_KEY,
                    firebase_project_id=PROD_PROJECT_ID,
                    firebase_web_config=parse_web_config(json.dumps(PROD_WEB_CONFIG)),
                )
                store = store or MemoryStore()
            options.update(overrides)
            app = create_app(Settings(**options), store=store, auth=auth, clock=clock)
            client = TestClient(app, follow_redirects=False, raise_server_exceptions=raise_server_exceptions)
            return stack.enter_context(client)

        yield factory


@pytest.fixture
def client(make_client: ClientFactory) -> TestClient:
    return make_client()
