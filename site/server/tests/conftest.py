"""Fixtures shared by every test module (helpers live in tests/support.py)."""

from __future__ import annotations

from collections.abc import Callable, Iterator
from contextlib import ExitStack
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from tests.support import SECRET_TEXT, FakeBuild, FakePublic, make_build, make_public

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

    Keyword arguments override Settings fields; `raise_server_exceptions=False` lets a
    test look at the 500 response instead of getting the exception.
    """
    with ExitStack() as stack:

        def factory(*, raise_server_exceptions: bool = True, **overrides: Any) -> TestClient:
            options: dict[str, Any] = {
                "app_env": "test",
                "public_dir": public.root,
                "hubs_dir": build.root,
                "git_commit": "abc1234",
            }
            options.update(overrides)
            app = create_app(Settings(**options))
            client = TestClient(app, follow_redirects=False, raise_server_exceptions=raise_server_exceptions)
            return stack.enter_context(client)

        yield factory


@pytest.fixture
def client(make_client: ClientFactory) -> TestClient:
    return make_client()
