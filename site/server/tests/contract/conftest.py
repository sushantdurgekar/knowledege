"""One store contract suite, run on every adapter (build-contracts.md section 11).

- `memory`: always.
- `firestore`: against the Firestore emulator, only when FIRESTORE_EMULATOR_HOST is
  set (skipped cleanly otherwise). Start one with
      java -jar cloud-firestore-emulator-*.jar --host 127.0.0.1 --port 8080
  or  npx firebase-tools@15.31.0 emulators:start --only firestore --project demo-studyhubs
  then  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 .venv/bin/pytest tests/contract

Billing is checked twice on Firestore: through the adapter's own counter (what the
quota meter sees) and through `CountingApi`, a wrapper around the gRPC API that
counts the documents each RPC actually reads or writes.
"""

from __future__ import annotations

import os
import threading
import urllib.request
import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.store.base import Store
from app.store.memory import MemoryStore

EMULATOR = os.environ.get("FIRESTORE_EMULATOR_HOST", "").strip()
PROJECT = "demo-studyhubs-contract"
RESET_AT = datetime(2026, 10, 13, 7, tzinfo=UTC)


class CountingApi:
    """Proxy for the GAPIC Firestore client that counts billable documents per RPC."""

    def __init__(self, inner: Any) -> None:
        self._inner = inner
        self._lock = threading.Lock()
        self.reads = 0
        self.writes = 0

    @staticmethod
    def _field(request: Any, name: str) -> Any:
        return request[name] if isinstance(request, dict) else getattr(request, name)

    def batch_get_documents(self, request: Any = None, **kwargs: Any) -> Any:
        with self._lock:
            self.reads += len(self._field(request, "documents"))  # a missing doc is still a read
        return self._inner.batch_get_documents(request=request, **kwargs)

    def commit(self, request: Any = None, **kwargs: Any) -> Any:
        with self._lock:
            self.writes += len(self._field(request, "writes"))
        return self._inner.commit(request=request, **kwargs)

    def run_aggregation_query(self, request: Any = None, **kwargs: Any) -> Any:
        with self._lock:
            self.reads += 1  # count(): 1 read per 1,000 index entries, at least 1
        return self._inner.run_aggregation_query(request=request, **kwargs)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._inner, name)

    def snapshot(self) -> tuple[int, int]:
        with self._lock:
            return self.reads, self.writes


@dataclass
class Adapter:
    kind: str
    store: Store
    api: CountingApi | None = None

    def counts(self) -> tuple[int, int]:
        """(reads, writes) so far, from the adapter's own counter."""
        snap = self.store.ops.snapshot()
        return snap.reads, snap.writes

    def wire_counts(self) -> tuple[int, int]:
        """(reads, writes) as billed on the wire (Firestore) or the counter (memory)."""
        return self.api.snapshot() if self.api is not None else self.counts()


def _wipe_emulator() -> None:
    url = f"http://{EMULATOR}/emulator/v1/projects/{PROJECT}/databases/(default)/documents"
    request = urllib.request.Request(url, method="DELETE")
    with urllib.request.urlopen(request, timeout=10):  # noqa: S310
        pass


@pytest.fixture(scope="session")
def emulator_ready() -> bool:
    if not EMULATOR:
        return False
    _wipe_emulator()
    return True


def make_firestore() -> Adapter:
    from app.store.firestore import FirestoreStore

    store = FirestoreStore(
        project_id=PROJECT,
        reset_at=lambda: RESET_AT,
        emulator_host=EMULATOR,
    )
    client = store.db
    _ = client._firestore_api  # create the GAPIC client, then wrap it
    api = CountingApi(client._firestore_api_internal)
    client._firestore_api_internal = api
    return Adapter("firestore", store, api)


@pytest.fixture(params=["memory", "firestore"])
def adapter(request: pytest.FixtureRequest, emulator_ready: bool) -> Iterator[Adapter]:
    if request.param == "memory":
        yield Adapter("memory", MemoryStore())
        return
    if not emulator_ready:
        pytest.skip("FIRESTORE_EMULATOR_HOST is not set")
    made = make_firestore()
    try:
        yield made
    finally:
        made.store.close()


@pytest.fixture
def uid() -> str:
    """A fresh user per test: the emulator database is shared by the whole run."""
    return "u-" + uuid.uuid4().hex[:16]


def later(hours: int) -> datetime:
    return RESET_AT + timedelta(hours=hours)
