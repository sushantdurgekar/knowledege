"""Runtime settings, read once from the environment.

M0 variables (build-contracts.md section 5): APP_ENV, PUBLIC_ORIGIN, PORT, PUBLIC_DIR,
HUBS_DIR, GIT_COMMIT / RENDER_GIT_COMMIT and LOG_LEVEL. Later milestones add their
own fields here; keep every field optional with a safe default for local development.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal, cast
from urllib.parse import urlsplit

SERVER_DIR = Path(__file__).resolve().parent.parent  # site/server  (Docker: /app)
SITE_DIR = SERVER_DIR.parent  # site/

AppEnv = Literal["development", "test", "production"]
APP_ENVS: tuple[AppEnv, ...] = ("development", "test", "production")
LOG_LEVELS = ("CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG")


class ConfigError(ValueError):
    """An environment variable has a value the server cannot run with."""


def _default_hubs_dir() -> Path:
    """`<site>/build` per the contract, with a fallback for the Docker layout.

    In the image the collector output sits at `/app/build`, next to the `app`
    package, so `<site>/build` would be `/build`. The Dockerfile should set
    HUBS_DIR explicitly; this fallback only keeps a forgotten variable from
    turning every hub into a 503.
    """
    site_build = SITE_DIR / "build"
    server_build = SERVER_DIR / "build"
    if not site_build.is_dir() and server_build.is_dir():
        return server_build
    return site_build


def normalize_origin(value: str) -> str:
    """Return `scheme://host[:port]` or raise ConfigError.

    The origin is compared byte for byte with the Origin header in M1 (CSRF),
    so it is lower-cased and must not carry a path, query or fragment.
    """
    parts = urlsplit(value.strip())
    if parts.scheme not in ("http", "https") or not parts.netloc:
        raise ConfigError(f"PUBLIC_ORIGIN must look like https://host[:port], got {value!r}")
    if parts.path not in ("", "/") or parts.query or parts.fragment or "@" in parts.netloc:
        raise ConfigError(f"PUBLIC_ORIGIN must be an origin without path or credentials: {value!r}")
    return f"{parts.scheme}://{parts.netloc.lower()}"


@dataclass(frozen=True, slots=True)
class Settings:
    app_env: AppEnv = "development"
    public_origin: str = "http://127.0.0.1:10000"
    port: int = 10000
    public_dir: Path = SERVER_DIR / "public"
    hubs_dir: Path = field(default_factory=_default_hubs_dir)
    git_commit: str = "dev"
    log_level: str = "INFO"

    def __post_init__(self) -> None:
        if self.app_env not in APP_ENVS:
            raise ConfigError(f"APP_ENV must be one of {', '.join(APP_ENVS)}, got {self.app_env!r}")
        if not 1 <= self.port <= 65535:
            raise ConfigError(f"PORT must be 1-65535, got {self.port}")
        level = self.log_level.upper()
        if level not in LOG_LEVELS:
            raise ConfigError(f"LOG_LEVEL must be one of {', '.join(LOG_LEVELS)}, got {self.log_level!r}")
        # Frozen dataclass: normalise through object.__setattr__.
        object.__setattr__(self, "log_level", level)
        object.__setattr__(self, "public_origin", normalize_origin(self.public_origin))
        object.__setattr__(self, "public_dir", Path(self.public_dir))
        object.__setattr__(self, "hubs_dir", Path(self.hubs_dir))

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @classmethod
    def from_env(cls, environ: Mapping[str, str] | None = None) -> Settings:
        """Build settings from `environ` (default: os.environ). Empty values count as unset."""
        env = os.environ if environ is None else environ

        def get(name: str) -> str | None:
            value = env.get(name, "").strip()
            return value or None

        kwargs: dict[str, object] = {}
        if (app_env := get("APP_ENV")) is not None:
            kwargs["app_env"] = cast(AppEnv, app_env.lower())
        if (origin := get("PUBLIC_ORIGIN")) is not None:
            kwargs["public_origin"] = origin
        if (port := get("PORT")) is not None:
            try:
                kwargs["port"] = int(port)
            except ValueError:
                raise ConfigError(f"PORT must be an integer, got {port!r}") from None
        if (public_dir := get("PUBLIC_DIR")) is not None:
            kwargs["public_dir"] = Path(public_dir)
        if (hubs_dir := get("HUBS_DIR")) is not None:
            kwargs["hubs_dir"] = Path(hubs_dir)
        commit = get("GIT_COMMIT") or get("RENDER_GIT_COMMIT")
        if commit is not None:
            kwargs["git_commit"] = commit
        if (log_level := get("LOG_LEVEL")) is not None:
            kwargs["log_level"] = log_level

        return cls(**kwargs)  # type: ignore[arg-type]
