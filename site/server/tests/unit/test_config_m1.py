"""M1 settings (build-contracts.md section 8): defaults and production refusals."""

from __future__ import annotations

import base64
import json
from pathlib import Path

import pytest

from app.config import DEV_SECRET_KEY, ConfigError, Settings, parse_sync_tiers
from tests.support import PROD_ENV, PROD_WEB_CONFIG

PROD = {"APP_ENV": "production", "PUBLIC_ORIGIN": "https://study-hubs.example", **PROD_ENV}


def test_development_defaults() -> None:
    s = Settings.from_env({})
    assert (s.auth_mode, s.store, s.secret_key, s.session_days) == ("fake", "memory", DEV_SECRET_KEY, 14)
    assert s.uses_dev_secret
    assert s.trusted_proxy_hops == 0
    assert s.quota_enforce is True
    assert s.write_budget == 19_000
    assert [t.frac for t in s.sync_tiers] == [0.5, 0.8, 1.0]
    assert (s.max_part_gz, s.max_doc_gz, s.max_body, s.max_body_decompressed) == (
        131_072,
        393_216,
        2_097_152,
        8_388_608,
    )
    assert (s.clock_skew_ms, s.user_writes_per_day, s.maintenance_force) == (900_000, 300, None)


def test_production_defaults() -> None:
    s = Settings.from_env(PROD)
    assert (s.auth_mode, s.store, s.trusted_proxy_hops) == ("firebase", "firestore", 1)
    assert s.firebase_web_config is not None
    assert s.firebase_web_config.to_json() == PROD_WEB_CONFIG
    assert not s.uses_dev_secret


@pytest.mark.parametrize(
    ("change", "message"),
    [
        ({"AUTH_MODE": "fake"}, "AUTH_MODE=fake"),
        ({"STORE": "memory"}, "STORE=memory"),
        ({"SECRET_KEY": ""}, "SECRET_KEY is required"),
        ({"SECRET_KEY": "short"}, "at least 32"),
        ({"SECRET_KEY": DEV_SECRET_KEY}, "development default"),
        ({"FIREBASE_PROJECT_ID": ""}, "FIREBASE_PROJECT_ID"),
        ({"FIREBASE_WEB_CONFIG": ""}, "FIREBASE_WEB_CONFIG is required"),
        ({"FIREBASE_WEB_CONFIG": "{}"}, "missing"),
        ({"FIREBASE_WEB_CONFIG": "nope"}, "JSON"),
        ({"FIRESTORE_EMULATOR_HOST": "127.0.0.1:8080"}, "FIRESTORE_EMULATOR_HOST"),
        ({"STORE": "postgres"}, "M3"),
        ({"GOOGLE_APPLICATION_CREDENTIALS": "/nonexistent/key.json"}, "readable file"),
        ({"FIREBASE_SERVICE_ACCOUNT_B64": "%%%"}, "base64"),
        (
            {"FIREBASE_WEB_CONFIG": json.dumps({**PROD_WEB_CONFIG, "projectId": "other"})},
            "projectId",
        ),
    ],
)
def test_production_refuses(change: dict[str, str], message: str) -> None:
    with pytest.raises(ConfigError, match=message):
        Settings.from_env({**PROD, **change})


@pytest.mark.parametrize(
    ("env", "message"),
    [
        ({"AUTH_MODE": "magic"}, "AUTH_MODE"),
        ({"STORE": "redis"}, "STORE"),
        ({"AUTH_MODE": "firebase"}, "FIREBASE_PROJECT_ID"),
        ({"STORE": "firestore"}, "FIREBASE_PROJECT_ID"),
        ({"SESSION_DAYS": "0"}, "SESSION_DAYS"),
        ({"SESSION_DAYS": "15"}, "SESSION_DAYS"),
        ({"TRUSTED_PROXY_HOPS": "11"}, "TRUSTED_PROXY_HOPS"),
        ({"SYNC_TIERS": "0.5:120:0"}, "SYNC_TIERS"),
        ({"SYNC_TIERS": "0.8:1:0:1,0.5:1:0:1"}, "increase"),
        ({"SYNC_TIERS": "a:b:c:d"}, "numeric"),
        ({"QUOTA_ENFORCE": "maybe"}, "QUOTA_ENFORCE"),
        ({"QUOTA_TZ": "Mars/Base"}, "QUOTA_TZ"),
        ({"QUOTA_RESERVE": "1"}, "QUOTA_RESERVE"),
        ({"QUOTA_WRITES": "0"}, "QUOTA_WRITES"),
        ({"MAX_PART_GZ": "500000"}, "MAX_PART_GZ"),
        ({"MAX_BODY": "9000000"}, "MAX_BODY"),
        ({"CLOCK_SKEW_MS": "-1"}, "CLOCK_SKEW_MS"),
        ({"MAINTENANCE_FORCE": "sometimes"}, "MAINTENANCE_FORCE"),
        ({"USER_WRITES_PER_DAY": "x"}, "USER_WRITES_PER_DAY"),
        (
            {"GOOGLE_APPLICATION_CREDENTIALS": __file__, "FIREBASE_SERVICE_ACCOUNT_B64": "e30="},
            "not both",
        ),
    ],
)
def test_invalid_values(env: dict[str, str], message: str) -> None:
    with pytest.raises(ConfigError, match=message):
        Settings.from_env(env)


def test_reads_m1_environment(tmp_path: Path) -> None:
    key = base64.b64encode(json.dumps({"type": "service_account", "project_id": "p"}).encode()).decode()
    s = Settings.from_env(
        {
            "AUTH_MODE": "firebase",
            "STORE": "firestore",
            "FIREBASE_PROJECT_ID": "demo-x",
            "FIREBASE_SERVICE_ACCOUNT_B64": key,
            "FIRESTORE_EMULATOR_HOST": "127.0.0.1:8080",
            "SECRET_KEY": "k" * 40,
            "SESSION_DAYS": "7",
            "TRUSTED_PROXY_HOPS": "2",
            "SYNC_TIERS": "1:30:0:30",
            "QUOTA_ENFORCE": "0",
            "QUOTA_WRITES": "1000",
            "QUOTA_RESERVE": "0.1",
            "USER_WRITES_PER_DAY": "5",
            "MAINTENANCE_FORCE": "Read_Only",
            "CLOCK_SKEW_MS": "1000",
        }
    )
    assert (s.auth_mode, s.store, s.session_days, s.trusted_proxy_hops) == ("firebase", "firestore", 7, 2)
    assert s.sync_tiers == parse_sync_tiers("1:30:0:30")
    assert s.quota_enforce is False
    assert s.write_budget == pytest.approx(900)
    assert (s.user_writes_per_day, s.maintenance_force, s.clock_skew_ms) == (5, "read_only", 1000)
    assert "k" * 40 not in repr(s)  # secrets never in repr
    assert key not in repr(s)


def test_maintenance_force_off_means_unset() -> None:
    assert Settings.from_env({"MAINTENANCE_FORCE": "off"}).maintenance_force is None
    assert Settings.from_env({"MAINTENANCE_FORCE": "full"}).maintenance_force == "full"
