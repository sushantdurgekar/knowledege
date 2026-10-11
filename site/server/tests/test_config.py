"""Settings.from_env()."""

from __future__ import annotations

from pathlib import Path

import pytest

from app import config
from app.config import ConfigError, Settings


def test_defaults() -> None:
    settings = Settings.from_env({})
    assert settings.app_env == "development"
    assert settings.public_origin == "http://127.0.0.1:10000"
    assert settings.port == 10000
    assert settings.public_dir == config.SERVER_DIR / "public"
    assert settings.hubs_dir == config.SITE_DIR / "build"
    assert settings.git_commit == "dev"
    assert settings.log_level == "INFO"
    assert not settings.is_production


def test_reads_environment(tmp_path: Path) -> None:
    settings = Settings.from_env(
        {
            "APP_ENV": "Production",
            "PUBLIC_ORIGIN": "https://Study-Hubs.onrender.com/",
            "PORT": "8080",
            "PUBLIC_DIR": str(tmp_path / "pub"),
            "HUBS_DIR": str(tmp_path / "hubs"),
            "GIT_COMMIT": "1234abc",
            "RENDER_GIT_COMMIT": "ignored",
            "LOG_LEVEL": "debug",
        }
    )
    assert settings.is_production
    assert settings.public_origin == "https://study-hubs.onrender.com"
    assert settings.port == 8080
    assert settings.public_dir == tmp_path / "pub"
    assert settings.hubs_dir == tmp_path / "hubs"
    assert settings.git_commit == "1234abc"
    assert settings.log_level == "DEBUG"


@pytest.mark.parametrize(
    ("env", "commit"),
    [
        ({"RENDER_GIT_COMMIT": "render123"}, "render123"),
        ({"GIT_COMMIT": "  ", "RENDER_GIT_COMMIT": "render123"}, "render123"),
        ({"GIT_COMMIT": "git456", "RENDER_GIT_COMMIT": "render123"}, "git456"),
        ({}, "dev"),
    ],
)
def test_commit_precedence(env: dict[str, str], commit: str) -> None:
    assert Settings.from_env(env).git_commit == commit


@pytest.mark.parametrize(
    "env",
    [
        {"APP_ENV": "staging"},
        {"PORT": "ten"},
        {"PORT": "0"},
        {"PORT": "70000"},
        {"LOG_LEVEL": "loud"},
        {"PUBLIC_ORIGIN": "study-hubs.onrender.com"},
        {"PUBLIC_ORIGIN": "ftp://study-hubs.onrender.com"},
        {"PUBLIC_ORIGIN": "https://study-hubs.onrender.com/path"},
        {"PUBLIC_ORIGIN": "https://user@study-hubs.onrender.com"},
        {"PUBLIC_ORIGIN": "https://study-hubs.onrender.com?x=1"},
    ],
)
def test_invalid_values_fail_fast(env: dict[str, str]) -> None:
    with pytest.raises(ConfigError):
        Settings.from_env(env)


def test_empty_values_count_as_unset() -> None:
    assert Settings.from_env({"APP_ENV": "", "PORT": " ", "HUBS_DIR": ""}) == Settings.from_env({})


def test_docker_layout_fallback(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    server = tmp_path / "app"  # /app in the image: /app/app is the package, /app/build the hubs
    (server / "build").mkdir(parents=True)
    monkeypatch.setattr(config, "SERVER_DIR", server)
    monkeypatch.setattr(config, "SITE_DIR", tmp_path)
    assert config._default_hubs_dir() == server / "build"
    (tmp_path / "build").mkdir()
    assert config._default_hubs_dir() == tmp_path / "build"  # the contract default wins when present
