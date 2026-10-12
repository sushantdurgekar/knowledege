"""The store interface every adapter implements (build-contracts.md section 11).

Methods are synchronous: FastAPI runs them in its thread pool. Each adapter counts
its own billable operations the way Firestore bills them (a get is 1 read even for
a missing document, a commit is 1 write per document) and reports them through
`OpCounter`, which the quota meter listens to.
"""

from __future__ import annotations

import threading
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal, Protocol, runtime_checkable

Part = Literal["main", "mocks", "cards", "legacy"]
PARTS: tuple[Part, ...] = ("main", "mocks", "cards", "legacy")
Status = Literal["accepted", "duplicate", "stale"]
USAGE_COUNTERS = ("reads", "writes", "deletes", "fsEgress", "appEgress")


class StoreError(Exception):
    """Base class for store failures the API maps onto error responses."""


class QuotaExhausted(StoreError):  # noqa: N818 - name fixed by the contract
    """The backend refused for quota reasons (Firestore `ResourceExhausted`)."""

    def __init__(self, kind: str, retry_at: datetime, message: str = "quota exhausted") -> None:
        super().__init__(message)
        self.kind = kind  # "reads" | "writes" | "deletes"
        self.retry_at = retry_at


class Unavailable(StoreError):  # noqa: N818 - name fixed by the contract
    """Temporary failure: timeouts, outages, contention. Safe to retry later."""


class TooLarge(StoreError):  # noqa: N818 - name fixed by the contract
    """The write would exceed a size limit of the backend."""


class Conflict(StoreError):  # noqa: N818 - name fixed by the contract
    """An optimistic-version check failed."""


@dataclass(frozen=True, slots=True)
class UserRecord:
    uid: str
    email: str | None = None
    email_verified: bool = False
    name: str | None = None
    photo: str | None = None
    provider: str | None = None
    created_at: datetime | None = None
    # On upsert: the login time to record ("now"); on read: the stored value.
    last_login_at: datetime | None = None


@dataclass(frozen=True, slots=True)
class PartIn:
    upd: int
    gz: bytes  # gzip of the compact JSON payload
    raw_len: int  # length of the compact JSON in bytes
    done: int | None  # modules done (main / legacy only)


@dataclass(frozen=True, slots=True)
class PartOut:
    upd: int
    gz: bytes | None  # None => stub: the server copy is not newer than `known`

    @property
    def is_stub(self) -> bool:
        return self.gz is None


@dataclass(frozen=True, slots=True)
class PartResult:
    status: Status
    upd: int  # the stored stamp after the decision


@dataclass(frozen=True, slots=True)
class OpCounts:
    reads: int = 0
    writes: int = 0
    deletes: int = 0
    fs_egress: int = 0

    def __sub__(self, other: OpCounts) -> OpCounts:
        return OpCounts(
            self.reads - other.reads,
            self.writes - other.writes,
            self.deletes - other.deletes,
            self.fs_egress - other.fs_egress,
        )


OpsListener = Callable[[OpCounts], None]


@dataclass
class OpCounter:
    """Thread-safe running totals of billable operations, with listeners (the meter)."""

    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)
    _totals: OpCounts = field(default_factory=OpCounts)
    _listeners: list[OpsListener] = field(default_factory=list, repr=False)

    def add(self, *, reads: int = 0, writes: int = 0, deletes: int = 0, fs_egress: int = 0) -> None:
        if not (reads or writes or deletes or fs_egress):
            return
        delta = OpCounts(reads, writes, deletes, fs_egress)
        with self._lock:
            t = self._totals
            self._totals = OpCounts(
                t.reads + reads, t.writes + writes, t.deletes + deletes, t.fs_egress + fs_egress
            )
            listeners = list(self._listeners)
        for listener in listeners:
            listener(delta)

    def snapshot(self) -> OpCounts:
        with self._lock:
            return self._totals

    def subscribe(self, listener: OpsListener) -> None:
        with self._lock:
            self._listeners.append(listener)

    def reset(self) -> None:
        with self._lock:
            self._totals = OpCounts()


@runtime_checkable
class Store(Protocol):
    kind: str
    ops: OpCounter

    def ping(self) -> None: ...
    def upsert_user(self, u: UserRecord, *, touch_login: bool) -> None: ...
    def get_user(self, uid: str) -> UserRecord | None: ...
    def count_users(self) -> int: ...
    def get_hub(self, uid: str, hub: str, known: dict[str, int]) -> dict[str, PartOut]: ...
    def put_parts(
        self, uid: str, hub: str, parts: dict[str, PartIn], now_ms: int
    ) -> dict[str, PartResult]: ...
    def add_usage(self, day: str, deltas: dict[str, int]) -> None: ...
    def get_usage(self, keys: list[str]) -> dict[str, dict[str, int]]: ...
    def get_setting(self, key: str) -> tuple[dict[str, Any], int] | None: ...
    def put_setting(self, key: str, value: dict[str, Any], *, expect_version: int | None) -> int: ...
    # Declared for M2/M3; adapters raise NotImplementedError until then.
    def list_hubs(self, uid: str) -> list[Any]: ...
    def delete_user(self, uid: str) -> None: ...
    def is_tombstoned(self, uid_hashes: list[str]) -> set[str]: ...
    def iter_users(self, page: int = 300) -> Iterator[UserRecord]: ...
    def iter_progress(self, page: int = 300) -> Iterator[tuple[str, str, dict[str, PartOut]]]: ...
    def iter_tombstones(self) -> Iterator[Any]: ...
    def restore_batch(self, recs: list[Any], *, mode: str, job_id: str, checkpoint: dict[str, Any]) -> Any: ...
    def wipe_for_replace(self, job_id: str) -> None: ...
    def get_job(self, id: str) -> Any: ...  # noqa: A002 - contract name
    def put_job(self, job: Any) -> None: ...
    def claim_job(self, id: str, holder: str, from_states: set[str]) -> bool: ...  # noqa: A002
    def close(self) -> None: ...


LATER = "M2/M3"


class LaterMethods:
    """The methods M1 declares but does not implement (shared by every adapter)."""

    def list_hubs(self, uid: str) -> list[Any]:
        raise NotImplementedError(LATER)

    def delete_user(self, uid: str) -> None:
        raise NotImplementedError(LATER)

    def is_tombstoned(self, uid_hashes: list[str]) -> set[str]:
        raise NotImplementedError(LATER)

    def iter_users(self, page: int = 300) -> Iterator[UserRecord]:
        raise NotImplementedError(LATER)

    def iter_progress(self, page: int = 300) -> Iterator[tuple[str, str, dict[str, PartOut]]]:
        raise NotImplementedError(LATER)

    def iter_tombstones(self) -> Iterator[Any]:
        raise NotImplementedError(LATER)

    def restore_batch(self, recs: list[Any], *, mode: str, job_id: str, checkpoint: dict[str, Any]) -> Any:
        raise NotImplementedError(LATER)

    def wipe_for_replace(self, job_id: str) -> None:
        raise NotImplementedError(LATER)

    def get_job(self, id: str) -> Any:  # noqa: A002
        raise NotImplementedError(LATER)

    def put_job(self, job: Any) -> None:
        raise NotImplementedError(LATER)

    def claim_job(self, id: str, holder: str, from_states: set[str]) -> bool:  # noqa: A002
        raise NotImplementedError(LATER)

    def tombstones(self) -> Any:
        raise NotImplementedError(LATER)


def progress_doc_id(uid: str, hub: str) -> str:
    """`{uid}~{hubId}`: one document per (user, hub)."""
    return f"{uid}~{hub}"


def merged_done(parts: dict[str, PartIn], accepted: set[str]) -> int | None:
    """The `done` count to store after accepting `accepted` parts (main or legacy carry it)."""
    for part in ("main", "legacy"):
        if part in accepted and parts[part].done is not None:
            return parts[part].done
    return None


def check_setting_version(current: int | None, expect_version: int | None) -> int:
    """Optimistic check shared by adapters; returns the new version or raises Conflict.

    `expect_version=None` writes unconditionally, `0` requires that the key does not
    exist yet, any other number must equal the stored version.
    """
    if expect_version is not None and (current or 0) != expect_version:
        raise Conflict(f"setting version is {current or 0}, expected {expect_version}")
    return (current or 0) + 1
