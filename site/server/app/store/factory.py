"""Pick the store from STORE (build-contracts.md section 11).

`firestore` is imported lazily: the gRPC stack is heavy and tests on the memory
store never need it.
"""

from __future__ import annotations

from app.clock import Clock
from app.config import Settings, decode_service_account_b64
from app.quota.pacific import next_reset
from app.store.base import Store
from app.store.memory import MemoryStore


def make_store(settings: Settings, clock: Clock) -> Store:
    if settings.store == "memory":
        return MemoryStore(app_env=settings.app_env)
    if settings.store == "firestore":
        from app.store.firestore import FirestoreStore

        info = (
            decode_service_account_b64(settings.firebase_service_account_b64)
            if settings.firebase_service_account_b64
            else None
        )
        return FirestoreStore(
            project_id=str(settings.firebase_project_id),
            reset_at=lambda: next_reset(clock.now(), settings.quota_tz),
            credentials_file=settings.google_application_credentials,
            credentials_info=info,
            emulator_host=settings.firestore_emulator_host,
        )
    raise ValueError(f"unknown STORE {settings.store!r}")
