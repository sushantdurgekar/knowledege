"""Runtime settings, read once from the environment.

M0 variables (build-contracts.md section 5): APP_ENV, PUBLIC_ORIGIN, PORT, PUBLIC_DIR,
HUBS_DIR, GIT_COMMIT / RENDER_GIT_COMMIT and LOG_LEVEL.

M1 variables (build-contracts.md section 8): AUTH_MODE, STORE, SECRET_KEY, SESSION_DAYS,
FIREBASE_PROJECT_ID, FIREBASE_WEB_CONFIG, GOOGLE_APPLICATION_CREDENTIALS /
FIREBASE_SERVICE_ACCOUNT_B64, FIRESTORE_EMULATOR_HOST, TRUSTED_PROXY_HOPS, SYNC_TIERS,
QUOTA_*, MAX_*, CLOCK_SKEW_MS, USER_WRITES_PER_DAY and MAINTENANCE_FORCE.

Every field is optional with a safe development default. Production refuses the
test-only modes (AUTH_MODE=fake, STORE=memory), a missing or short SECRET_KEY and
missing Firebase settings, so a misconfigured deploy fails at startup instead of
running half-open.
"""

from __future__ import annotations

import base64
import binascii
import json
import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal, cast
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

SERVER_DIR = Path(__file__).resolve().parent.parent  # site/server  (Docker: /app)
SITE_DIR = SERVER_DIR.parent  # site/

AppEnv = Literal["development", "test", "production"]
APP_ENVS: tuple[AppEnv, ...] = ("development", "test", "production")
LOG_LEVELS = ("CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG")
AUTH_MODES = ("firebase", "fake")
STORES = ("firestore", "memory")  # "postgres" arrives in M3
MAINTENANCE_MODES = ("read_only", "full")

# Development/test only. Production refuses to start without its own SECRET_KEY.
DEV_SECRET_KEY = "studyhubs-development-secret-key-never-use-in-production"  # noqa: S105
MIN_SECRET_BYTES = 32
# Firebase session cookies live 5 minutes to 2 weeks.
MAX_SESSION_DAYS = 14
DEFAULT_SYNC_TIERS = "0.5:120:0:60,0.8:300:60:120,1.0:900:60:300"
WEB_CONFIG_KEYS = ("apiKey", "authDomain", "projectId", "appId")


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

    The origin is compared byte for byte with the Origin header (CSRF), so it is
    lower-cased and must not carry a path, query or fragment.
    """
    parts = urlsplit(value.strip())
    if parts.scheme not in ("http", "https") or not parts.netloc:
        raise ConfigError(f"PUBLIC_ORIGIN must look like https://host[:port], got {value!r}")
    if parts.path not in ("", "/") or parts.query or parts.fragment or "@" in parts.netloc:
        raise ConfigError(f"PUBLIC_ORIGIN must be an origin without path or credentials: {value!r}")
    return f"{parts.scheme}://{parts.netloc.lower()}"


@dataclass(frozen=True, slots=True)
class SyncTier:
    """One `frac:flushS:hiddenMinS:refreshS` entry of SYNC_TIERS.

    The tier applies while `writes_today / budget < frac`; at or above the last
    tier's `frac` the server pauses sync.
    """

    frac: float
    flush_s: int
    hidden_min_s: int
    refresh_s: int


def parse_sync_tiers(value: str) -> tuple[SyncTier, ...]:
    tiers: list[SyncTier] = []
    for raw in value.split(","):
        fields = raw.strip().split(":")
        if len(fields) != 4:
            raise ConfigError(f"SYNC_TIERS entries must be frac:flushS:hiddenMinS:refreshS, got {raw!r}")
        try:
            tier = SyncTier(float(fields[0]), int(fields[1]), int(fields[2]), int(fields[3]))
        except ValueError:
            raise ConfigError(f"SYNC_TIERS entry {raw!r} is not numeric") from None
        if not 0 < tier.frac <= 10 or tier.flush_s < 1 or tier.hidden_min_s < 0 or tier.refresh_s < 1:
            raise ConfigError(f"SYNC_TIERS entry {raw!r} is out of range")
        if tiers and tier.frac <= tiers[-1].frac:
            raise ConfigError("SYNC_TIERS fractions must increase")
        tiers.append(tier)
    if not tiers:
        raise ConfigError("SYNC_TIERS needs at least one tier")
    return tuple(tiers)


@dataclass(frozen=True, slots=True)
class FirebaseWebConfig:
    """The public browser config returned by /api/config (no secrets in it)."""

    api_key: str
    auth_domain: str
    project_id: str
    app_id: str

    def to_json(self) -> dict[str, str]:
        return {
            "apiKey": self.api_key,
            "authDomain": self.auth_domain,
            "projectId": self.project_id,
            "appId": self.app_id,
        }


def parse_web_config(value: str) -> FirebaseWebConfig:
    try:
        data = json.loads(value)
    except ValueError:
        raise ConfigError("FIREBASE_WEB_CONFIG must be JSON") from None
    if not isinstance(data, dict):
        raise ConfigError("FIREBASE_WEB_CONFIG must be a JSON object")
    missing = [key for key in WEB_CONFIG_KEYS if not isinstance(data.get(key), str) or not data[key]]
    if missing:
        raise ConfigError(f"FIREBASE_WEB_CONFIG is missing {', '.join(missing)}")
    return FirebaseWebConfig(data["apiKey"], data["authDomain"], data["projectId"], data["appId"])


def decode_service_account_b64(value: str) -> dict[str, object]:
    """FIREBASE_SERVICE_ACCOUNT_B64 -> the service-account JSON object (never logged)."""
    try:
        data = json.loads(base64.b64decode(value.strip(), validate=True))
    except (binascii.Error, ValueError):
        raise ConfigError("FIREBASE_SERVICE_ACCOUNT_B64 must be base64 of a JSON object") from None
    if not isinstance(data, dict) or data.get("type") != "service_account":
        raise ConfigError("FIREBASE_SERVICE_ACCOUNT_B64 must hold a service-account key")
    return data


@dataclass(frozen=True, slots=True)
class Settings:
    # M0
    app_env: AppEnv = "development"
    public_origin: str = "http://127.0.0.1:10000"
    port: int = 10000
    public_dir: Path = SERVER_DIR / "public"
    hubs_dir: Path = field(default_factory=_default_hubs_dir)
    git_commit: str = "dev"
    log_level: str = "INFO"
    # M1: auth and store. None means "the default for APP_ENV" (resolved below).
    auth_mode: str | None = None
    store: str | None = None
    secret_key: str | None = field(default=None, repr=False)
    session_days: int = 14
    firebase_project_id: str | None = None
    firebase_web_config: FirebaseWebConfig | None = None
    google_application_credentials: str | None = None
    firebase_service_account_b64: str | None = field(default=None, repr=False)
    firestore_emulator_host: str | None = None
    trusted_proxy_hops: int | None = None
    # M1: sync tuning and quota
    sync_tiers: tuple[SyncTier, ...] = field(default_factory=lambda: parse_sync_tiers(DEFAULT_SYNC_TIERS))
    quota_enforce: bool | None = None
    quota_tz: str = "America/Los_Angeles"
    quota_reads: int = 50_000
    quota_writes: int = 20_000
    quota_deletes: int = 20_000
    quota_reserve: float = 0.05
    max_part_gz: int = 131_072
    max_doc_gz: int = 393_216
    max_body: int = 2_097_152
    max_body_decompressed: int = 8_388_608
    clock_skew_ms: int = 900_000
    user_writes_per_day: int = 300
    maintenance_force: str | None = None

    def __post_init__(self) -> None:
        if self.app_env not in APP_ENVS:
            raise ConfigError(f"APP_ENV must be one of {', '.join(APP_ENVS)}, got {self.app_env!r}")
        if not 1 <= self.port <= 65535:
            raise ConfigError(f"PORT must be 1-65535, got {self.port}")
        level = self.log_level.upper()
        if level not in LOG_LEVELS:
            raise ConfigError(f"LOG_LEVEL must be one of {', '.join(LOG_LEVELS)}, got {self.log_level!r}")
        # Frozen dataclass: normalise through object.__setattr__.
        set_ = object.__setattr__
        set_(self, "log_level", level)
        set_(self, "public_origin", normalize_origin(self.public_origin))
        set_(self, "public_dir", Path(self.public_dir))
        set_(self, "hubs_dir", Path(self.hubs_dir))
        self._check_m1()

    def _check_m1(self) -> None:
        set_ = object.__setattr__
        prod = self.is_production

        auth_mode = (self.auth_mode or ("firebase" if prod else "fake")).lower()
        if auth_mode not in AUTH_MODES:
            raise ConfigError(f"AUTH_MODE must be one of {', '.join(AUTH_MODES)}, got {self.auth_mode!r}")
        store = (self.store or ("firestore" if prod else "memory")).lower()
        if store == "postgres":
            raise ConfigError("STORE=postgres is not available yet (it arrives in M3)")
        if store not in STORES:
            raise ConfigError(f"STORE must be one of {', '.join(STORES)}, got {self.store!r}")
        set_(self, "auth_mode", auth_mode)
        set_(self, "store", store)

        if prod and auth_mode == "fake":
            raise ConfigError("AUTH_MODE=fake is refused when APP_ENV=production")
        if prod and store == "memory":
            raise ConfigError("STORE=memory is refused when APP_ENV=production")

        if self.secret_key is None:
            if prod:
                raise ConfigError("SECRET_KEY is required when APP_ENV=production")
            set_(self, "secret_key", DEV_SECRET_KEY)
        elif len(self.secret_key.encode("utf-8")) < MIN_SECRET_BYTES:
            raise ConfigError(f"SECRET_KEY must be at least {MIN_SECRET_BYTES} bytes")
        if prod and self.secret_key == DEV_SECRET_KEY:
            raise ConfigError("SECRET_KEY must not be the development default in production")

        if not 1 <= self.session_days <= MAX_SESSION_DAYS:
            raise ConfigError(f"SESSION_DAYS must be 1-{MAX_SESSION_DAYS}, got {self.session_days}")

        needs_firebase = auth_mode == "firebase" or store == "firestore"
        if needs_firebase and not self.firebase_project_id:
            raise ConfigError("FIREBASE_PROJECT_ID is required when AUTH_MODE=firebase or STORE=firestore")
        web = self.firebase_web_config
        if prod and auth_mode == "firebase" and web is None:
            raise ConfigError("FIREBASE_WEB_CONFIG is required when AUTH_MODE=firebase in production")
        if web is not None and self.firebase_project_id and web.project_id != self.firebase_project_id:
            raise ConfigError("FIREBASE_WEB_CONFIG.projectId must equal FIREBASE_PROJECT_ID")
        if self.google_application_credentials and self.firebase_service_account_b64:
            raise ConfigError("Set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_B64, not both")
        if self.google_application_credentials and not Path(self.google_application_credentials).is_file():
            raise ConfigError("GOOGLE_APPLICATION_CREDENTIALS does not name a readable file")
        if self.firebase_service_account_b64:
            decode_service_account_b64(self.firebase_service_account_b64)
        if prod and self.firestore_emulator_host:
            raise ConfigError("FIRESTORE_EMULATOR_HOST must not be set when APP_ENV=production")
        if store == "firestore" and not self.firestore_emulator_host:
            # Real data: fake sign-in (any uid) and the test-only routes never touch it, in any env.
            if auth_mode == "fake":
                raise ConfigError(
                    "AUTH_MODE=fake works only with STORE=memory or the Firestore emulator "
                    "(set AUTH_MODE=firebase, or FIRESTORE_EMULATOR_HOST)"
                )
            if self.is_test:
                raise ConfigError("APP_ENV=test with STORE=firestore needs FIRESTORE_EMULATOR_HOST")

        hops = self.trusted_proxy_hops
        if hops is None:
            hops = 1 if prod else 0
        if not 0 <= hops <= 10:
            raise ConfigError(f"TRUSTED_PROXY_HOPS must be 0-10, got {hops}")
        set_(self, "trusted_proxy_hops", hops)

        if not self.sync_tiers:
            raise ConfigError("SYNC_TIERS needs at least one tier")
        set_(self, "sync_tiers", tuple(self.sync_tiers))
        set_(self, "quota_enforce", True if self.quota_enforce is None else bool(self.quota_enforce))
        try:
            ZoneInfo(self.quota_tz)
        except (ZoneInfoNotFoundError, ValueError):
            raise ConfigError(f"QUOTA_TZ is not a known time zone: {self.quota_tz!r}") from None
        for name in ("quota_reads", "quota_writes", "quota_deletes", "max_part_gz", "max_doc_gz"):
            if getattr(self, name) < 1:
                raise ConfigError(f"{name.upper()} must be positive")
        for name in ("max_body", "max_body_decompressed", "user_writes_per_day"):
            if getattr(self, name) < 1:
                raise ConfigError(f"{name.upper()} must be positive")
        if not 0 <= self.quota_reserve < 1:
            raise ConfigError(f"QUOTA_RESERVE must be in [0, 1), got {self.quota_reserve}")
        if self.max_part_gz > self.max_doc_gz:
            raise ConfigError("MAX_PART_GZ must not exceed MAX_DOC_GZ")
        if self.max_body > self.max_body_decompressed:
            raise ConfigError("MAX_BODY must not exceed MAX_BODY_DECOMPRESSED")
        if self.clock_skew_ms < 0:
            raise ConfigError("CLOCK_SKEW_MS must not be negative")

        mode = (self.maintenance_force or "").strip().lower() or None
        if mode == "off":
            mode = None
        if mode is not None and mode not in MAINTENANCE_MODES:
            raise ConfigError(f"MAINTENANCE_FORCE must be read_only or full, got {self.maintenance_force!r}")
        set_(self, "maintenance_force", mode)

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def is_test(self) -> bool:
        return self.app_env == "test"

    @property
    def https(self) -> bool:
        return self.public_origin.startswith("https://")

    @property
    def uses_dev_secret(self) -> bool:
        return self.secret_key == DEV_SECRET_KEY

    @property
    def secret(self) -> bytes:
        """SECRET_KEY as bytes (always set after validation)."""
        return cast(str, self.secret_key).encode("utf-8")

    @property
    def write_budget(self) -> float:
        """B = QUOTA_WRITES x (1 - QUOTA_RESERVE)."""
        return self.quota_writes * (1 - self.quota_reserve)

    @classmethod
    def from_env(cls, environ: Mapping[str, str] | None = None) -> Settings:
        """Build settings from `environ` (default: os.environ). Empty values count as unset."""
        env = os.environ if environ is None else environ

        def get(name: str) -> str | None:
            value = env.get(name, "").strip()
            return value or None

        def get_int(name: str) -> int | None:
            value = get(name)
            if value is None:
                return None
            try:
                return int(value)
            except ValueError:
                raise ConfigError(f"{name} must be an integer, got {value!r}") from None

        def get_float(name: str) -> float | None:
            value = get(name)
            if value is None:
                return None
            try:
                return float(value)
            except ValueError:
                raise ConfigError(f"{name} must be a number, got {value!r}") from None

        def get_bool(name: str) -> bool | None:
            value = get(name)
            if value is None:
                return None
            lowered = value.lower()
            if lowered in ("1", "true", "yes", "on"):
                return True
            if lowered in ("0", "false", "no", "off"):
                return False
            raise ConfigError(f"{name} must be 1 or 0, got {value!r}")

        kwargs: dict[str, object] = {}
        if (app_env := get("APP_ENV")) is not None:
            kwargs["app_env"] = cast(AppEnv, app_env.lower())
        if (origin := get("PUBLIC_ORIGIN")) is not None:
            kwargs["public_origin"] = origin
        if (port := get_int("PORT")) is not None:
            kwargs["port"] = port
        if (public_dir := get("PUBLIC_DIR")) is not None:
            kwargs["public_dir"] = Path(public_dir)
        if (hubs_dir := get("HUBS_DIR")) is not None:
            kwargs["hubs_dir"] = Path(hubs_dir)
        commit = get("GIT_COMMIT") or get("RENDER_GIT_COMMIT")
        if commit is not None:
            kwargs["git_commit"] = commit
        if (log_level := get("LOG_LEVEL")) is not None:
            kwargs["log_level"] = log_level

        strings = {
            "AUTH_MODE": "auth_mode",
            "STORE": "store",
            "FIREBASE_PROJECT_ID": "firebase_project_id",
            "GOOGLE_APPLICATION_CREDENTIALS": "google_application_credentials",
            "FIREBASE_SERVICE_ACCOUNT_B64": "firebase_service_account_b64",
            "FIRESTORE_EMULATOR_HOST": "firestore_emulator_host",
            "QUOTA_TZ": "quota_tz",
            "MAINTENANCE_FORCE": "maintenance_force",
        }
        for name, attr in strings.items():
            if (value := get(name)) is not None:
                kwargs[attr] = value
        # SECRET_KEY is used verbatim (no strip): whitespace counts as key material.
        if env.get("SECRET_KEY"):
            kwargs["secret_key"] = env["SECRET_KEY"]
        if (web := get("FIREBASE_WEB_CONFIG")) is not None:
            kwargs["firebase_web_config"] = parse_web_config(web)
        if (tiers := get("SYNC_TIERS")) is not None:
            kwargs["sync_tiers"] = parse_sync_tiers(tiers)
        if (enforce := get_bool("QUOTA_ENFORCE")) is not None:
            kwargs["quota_enforce"] = enforce
        if (reserve := get_float("QUOTA_RESERVE")) is not None:
            kwargs["quota_reserve"] = reserve
        integers = {
            "SESSION_DAYS": "session_days",
            "TRUSTED_PROXY_HOPS": "trusted_proxy_hops",
            "QUOTA_READS": "quota_reads",
            "QUOTA_WRITES": "quota_writes",
            "QUOTA_DELETES": "quota_deletes",
            "MAX_PART_GZ": "max_part_gz",
            "MAX_DOC_GZ": "max_doc_gz",
            "MAX_BODY": "max_body",
            "MAX_BODY_DECOMPRESSED": "max_body_decompressed",
            "CLOCK_SKEW_MS": "clock_skew_ms",
            "USER_WRITES_PER_DAY": "user_writes_per_day",
        }
        for name, attr in integers.items():
            if (number := get_int(name)) is not None:
                kwargs[attr] = number

        return cls(**kwargs)  # type: ignore[arg-type]
