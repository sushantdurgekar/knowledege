"""M3 settings (build-contracts.md section 23): STORE=postgres and its defaults."""

from __future__ import annotations

import pytest

from app.config import DEFAULT_SYNC_TIERS, ConfigError, Settings, parse_sync_tiers
from tests.support import PROD_ENV

URL = "postgresql://app@db.internal:5432/studyhubs"
PROD = {"APP_ENV": "production", "PUBLIC_ORIGIN": "https://study-hubs.example", **PROD_ENV}


def test_postgres_defaults() -> None:
    s = Settings.from_env({"STORE": "postgres", "DATABASE_URL": URL})
    assert (s.store, s.database_url, s.pg_pool_max) == ("postgres", URL, 5)
    assert s.quota_enforce is False  # no Firestore quota behind Postgres
    assert s.sync_tiers == parse_sync_tiers("1:30:0:30")  # one tier, a 30 s flush
    assert URL not in repr(s)  # the URL may carry a password


def test_postgres_in_production() -> None:
    s = Settings.from_env({**PROD, "STORE": "postgres", "DATABASE_URL": URL, "PG_POOL_MAX": "3"})
    assert (s.store, s.pg_pool_max, s.quota_enforce) == ("postgres", 3, False)


def test_explicit_values_win_over_the_postgres_defaults() -> None:
    s = Settings.from_env(
        {"STORE": "postgres", "DATABASE_URL": URL, "QUOTA_ENFORCE": "1", "SYNC_TIERS": DEFAULT_SYNC_TIERS}
    )
    assert s.quota_enforce is True
    assert s.sync_tiers == parse_sync_tiers(DEFAULT_SYNC_TIERS)


def test_other_stores_keep_their_defaults() -> None:
    s = Settings.from_env({"DATABASE_URL": URL})
    assert (s.store, s.quota_enforce) == ("memory", True)
    assert s.sync_tiers == parse_sync_tiers(DEFAULT_SYNC_TIERS)


@pytest.mark.parametrize(
    ("env", "message"),
    [
        ({"STORE": "postgres"}, "DATABASE_URL"),
        ({"STORE": "postgres", "DATABASE_URL": "mysql://x"}, "DATABASE_URL"),
        ({"STORE": "postgres", "DATABASE_URL": URL, "PG_POOL_MAX": "0"}, "PG_POOL_MAX"),
        ({"PG_POOL_MAX": "x"}, "PG_POOL_MAX"),
    ],
)
def test_postgres_refusals(env: dict[str, str], message: str) -> None:
    with pytest.raises(ConfigError, match=message):
        Settings.from_env(env)
