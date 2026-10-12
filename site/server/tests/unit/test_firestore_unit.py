"""Firestore adapter without a server: error mapping, retry policy and RPC bounds."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

import pytest
from google.api_core import exceptions as gexc
from google.auth import exceptions as auth_exc

from app.store.base import QuotaExhausted, TooLarge, Unavailable
from app.store.firestore import RETRY, TIMEOUT, FirestoreStore, _BoundedTransaction

RESET = datetime(2026, 10, 13, 7, tzinfo=UTC)


@pytest.fixture
def store() -> FirestoreStore:
    return FirestoreStore(project_id="demo-unit", reset_at=lambda: RESET, client=object())  # type: ignore[arg-type]


@pytest.mark.parametrize(
    ("exc", "kind", "expected"),
    [
        (gexc.ResourceExhausted("Quota exceeded."), "writes", QuotaExhausted),
        (gexc.ServiceUnavailable("down"), "reads", Unavailable),
        (gexc.DeadlineExceeded("slow"), "reads", Unavailable),
        (gexc.RetryError("gave up", cause=gexc.ServiceUnavailable("x")), "reads", Unavailable),
        (gexc.InternalServerError("oops"), "reads", Unavailable),
        (gexc.Aborted("contention"), "writes", Unavailable),
        (auth_exc.DefaultCredentialsError("no ADC"), "reads", Unavailable),
        (gexc.InvalidArgument("Document exceeds the maximum allowed size"), "writes", TooLarge),
        (gexc.InvalidArgument("bad field path"), "writes", Unavailable),
        (RuntimeError("surprise"), "reads", Unavailable),
    ],
)
def test_error_mapping(store: FirestoreStore, exc: Exception, kind: str, expected: type) -> None:
    mapped = store._translate(exc, kind)
    assert isinstance(mapped, expected)
    if isinstance(mapped, QuotaExhausted):
        assert (mapped.kind, mapped.retry_at) == (kind, RESET)


def test_quota_found_in_the_cause_chain(store: FirestoreStore) -> None:
    try:
        try:
            raise gexc.ResourceExhausted("quota")
        except gexc.ResourceExhausted as inner:
            raise ValueError("Failed to commit transaction in 3 attempts.") from inner
    except ValueError as outer:
        mapped = store._translate(outer, "writes")
    assert isinstance(mapped, QuotaExhausted)


def test_mapped_context_reraises_store_errors(store: FirestoreStore) -> None:
    with pytest.raises(QuotaExhausted), store._mapped("reads"):
        raise gexc.ResourceExhausted("x")
    with pytest.raises(Unavailable), store._mapped("reads"):
        raise Unavailable("already mapped")


def test_retry_never_retries_resource_exhausted() -> None:
    predicate = RETRY._predicate
    assert not predicate(gexc.ResourceExhausted("quota"))
    assert not predicate(gexc.InvalidArgument("bad"))
    assert not predicate(gexc.Aborted("contention"))  # the transaction runner handles it
    assert predicate(gexc.ServiceUnavailable("down"))
    assert predicate(gexc.DeadlineExceeded("slow"))
    assert predicate(gexc.InternalServerError("oops"))
    assert RETRY._timeout <= 8
    assert TIMEOUT == 10


class FakeApi:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def begin_transaction(self, **kwargs: Any) -> Any:
        self.calls.append(("begin", kwargs))
        return SimpleNamespace(transaction=b"tx1")

    def commit(self, **kwargs: Any) -> Any:
        self.calls.append(("commit", kwargs))
        return SimpleNamespace(write_results=[], commit_time=None)

    def rollback(self, **kwargs: Any) -> Any:
        self.calls.append(("rollback", kwargs))


def test_transaction_rpcs_are_bounded() -> None:
    api = FakeApi()
    client = SimpleNamespace(
        _firestore_api=api, _database_string="projects/p/databases/(default)", _rpc_metadata=[]
    )
    tx = _BoundedTransaction(client, max_attempts=3)  # type: ignore[arg-type]
    tx._begin()
    tx._commit()
    tx._begin()
    tx._rollback()
    assert [name for name, _ in api.calls] == ["begin", "commit", "begin", "rollback"]
    for _, kwargs in api.calls:
        assert kwargs["retry"] is RETRY
        assert kwargs["timeout"] == TIMEOUT
