"""The store interface every adapter implements (build-contracts.md section 11).

Methods are synchronous: FastAPI runs them in its thread pool. Each adapter counts
its own billable operations the way Firestore bills them (a get is 1 read even for
a missing document, a commit is 1 write per document) and reports them through
`OpCounter`, which the quota meter listens to.
"""

from __future__ import annotations

import hashlib
import re
import secrets
import threading
from collections.abc import Callable, Iterator
from copy import deepcopy
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


class AccountDeleted(StoreError):  # noqa: N818 - named like the contract's other errors
    """`put_parts` found the uid's tombstone on a hub's first write: the account was deleted.

    Another device of a deleted account keeps a valid session cookie (normal requests do
    not check revocation), so the store refuses to recreate documents under that uid.
    """


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
class PartInfo:
    """One stored part as the account page and the export see it."""

    upd: int
    bytes: int  # length of the compact JSON (`n_<part>`)
    gz: bytes | None = None  # only when asked for payloads


@dataclass(frozen=True, slots=True)
class HubSummary:
    hub: str
    parts: dict[str, PartInfo]
    done: int | None


@dataclass(frozen=True, slots=True)
class Tombstone:
    h: str  # sha256("studyhubs-tombstone-v1:" + uid), hex
    at: datetime


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
    # M2: account, admin, jobs and backups.
    def list_hubs(self, uid: str, *, payloads: bool = False) -> list[HubSummary]: ...
    def delete_user(self, uid: str) -> int: ...
    def put_tombstone(self, h: str, at: datetime) -> None: ...
    def is_tombstoned(self, uid_hashes: list[str]) -> set[str]: ...
    def count_docs(self, kind: str) -> int: ...
    def iter_users(self, page: int = 300) -> Iterator[UserRecord]: ...
    def iter_progress(self, page: int = 300) -> Iterator[tuple[str, str, dict[str, PartOut]]]: ...
    def iter_tombstones(self, page: int = 300) -> Iterator[Tombstone]: ...
    def storage_scan(self, page: int = 300) -> tuple[int, int]: ...
    def get_job(self, id: str) -> dict[str, Any] | None: ...
    def put_job(self, job: dict[str, Any]) -> None: ...
    # Atomic state transition (transaction): from one of `from_states` to `to_state`
    # ("running" by default, the claim), recording `holder`. False when the job is
    # missing or in another state, so exactly one of several racing callers wins.
    def claim_job(
        self, id: str, holder: str, from_states: set[str], *, to_state: str = "running"
    ) -> bool: ...
    # Jobs in `states` oldest first by id, or (no states) the newest `limit` by `createdAt`.
    def list_jobs(self, states: set[str] | None = None, limit: int = 50) -> list[dict[str, Any]]: ...
    # Compare-and-set on a job: merge `fields` into it only if every `expect` field
    # currently has that value (a missing field equals None). Heartbeats, a stale job's
    # reclaim and a restore's state changes all go through it. False when it did not apply.
    def update_job(self, id: str, fields: dict[str, Any], *, expect: dict[str, Any]) -> bool: ...
    # M3: restore (build-contracts.md section 24). `restore_batch` applies one batch and
    # stores its checkpoint in the same transaction (see `RestoreItem`, `BatchResult`).
    def restore_lookup(
        self, uids: list[str], docs: list[tuple[str, str]]
    ) -> tuple[set[str], dict[tuple[str, str], dict[str, int]]]: ...
    def restore_batch(
        self,
        recs: list[RestoreItem],
        *,
        mode: str,
        job_id: str,
        checkpoint: dict[str, Any],
        holder: str,
    ) -> BatchResult: ...
    def swap_replace(
        self, job_id: str, *, holder: str, expected: dict[str, int], checkpoint: dict[str, Any]
    ) -> BatchResult: ...
    def wipe_for_replace(self, job_id: str) -> None: ...
    def close(self) -> None: ...


def progress_doc_id(uid: str, hub: str) -> str:
    """`{uid}~{hubId}`: one document per (user, hub)."""
    return f"{uid}~{hub}"


COUNT_KINDS = ("users", "progress", "tombstones")
JOB_STATES = (
    "scheduled",
    "running",
    "paused_quota",
    "succeeded",
    "needs_attention",
    "failed",
    "cancelled",
    "missed",
)
ACTIVE_JOB_STATES = frozenset({"scheduled", "running", "paused_quota"})
TOMBSTONE_CONTEXT = "studyhubs-tombstone-v1:"


def tombstone_hash(uid: str) -> str:
    """The tombstone id of a deleted account: no uid is kept, only this hash."""
    return hashlib.sha256((TOMBSTONE_CONTEXT + uid).encode("utf-8")).hexdigest()


def progress_range(uid: str) -> tuple[str, str]:
    """[start, end) of the document ids `{uid}~...`: "~" is 0x7E, so the end is uid + 0x7F.

    uids never contain "~" (identity.UID_RE), so no other user's ids fall inside.
    """
    return uid + "~", uid + "\x7f"


def new_job_id(now_ms: int) -> str:
    """Time-ordered job ids (`j<ms>-<hex>`): the newest jobs sort last by document id."""
    return f"j{now_ms:013d}-{secrets.token_hex(4)}"


JOB_ID_RE = re.compile(r"j\d{13}-[0-9a-f]{8}")


def valid_job_id(value: object) -> bool:
    """Only ids `new_job_id` makes (anything else, e.g. `__x__`, Firestore refuses outright)."""
    return isinstance(value, str) and JOB_ID_RE.fullmatch(value) is not None


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


# -- M3: restore ---------------------------------------------------------------------------

RESTORE_KINDS = ("settings", "tombstone", "user", "progress")
HUB_ID_RE = re.compile(r"[a-z0-9][a-z0-9-]{1,40}")


class JobLost(StoreError):  # noqa: N818 - named like the contract's other errors
    """The job is no longer held by this runner (reclaimed by another, or cancelled)."""


class Unsupported(StoreError):  # noqa: N818 - named like the contract's other errors
    """The store cannot do this (e.g. `replace` on Firestore)."""


@dataclass(frozen=True, slots=True)
class RestoreItem:
    """One backup record to apply: a `user`, a `progress` part or a `tombstone`.

    `line` is the record's 1-based line in the validated NDJSON. Skipped records
    (tombstoned uids) never reach the store; the `settings` record is the runner's.
    """

    t: str
    line: int
    uid: str = ""
    hub: str = ""
    part: str = ""
    data: PartIn | None = None
    user: UserRecord | None = None
    tombstone: Tombstone | None = None


@dataclass(frozen=True, slots=True)
class BatchResult:
    applied: bool  # False: already applied (the stored checkpoint is at or past this batch)
    checkpoint: dict[str, Any]  # the job's checkpoint after the call
    written: dict[str, int] = field(default_factory=dict)
    kept: dict[str, int] = field(default_factory=dict)


def empty_counts() -> dict[str, int]:
    return dict.fromkeys(RESTORE_KINDS, 0)


def check_batch(stored: dict[str, Any] | None, checkpoint: dict[str, Any], holder: str) -> bool:
    """Shared `restore_batch` precondition. True: apply; False: already applied.

    Raises JobLost when the job is gone, not running or held by someone else, and
    Conflict when the batch does not start right after the stored checkpoint.
    """
    if stored is None or stored.get("state") != "running" or stored.get("holder") != holder:
        raise JobLost("the restore job is no longer held by this runner")
    done = int((stored.get("checkpoint") or {}).get("line", 0))
    if done >= int(checkpoint["line"]):
        return False
    if done != int(checkpoint["from"]) - 1:
        raise Conflict(f"checkpoint is at line {done}, the batch starts at {checkpoint['from']}")
    return True


def with_counts(checkpoint: dict[str, Any], written: dict[str, int], kept: dict[str, int]) -> dict[str, Any]:
    """The checkpoint to store: the runner's totals plus this batch's store decisions."""
    out = deepcopy(checkpoint)
    for name, counts in (("written", written), ("kept", kept)):
        total = out.setdefault(name, empty_counts())
        for kind, n in counts.items():
            total[kind] = total.get(kind, 0) + n
    return out


def newest_parts(items: list[RestoreItem]) -> tuple[dict[tuple[str, str], dict[str, PartIn]], int]:
    """Progress items grouped by hub document, the newest of any repeated part kept.

    Returns the groups and how many repeated (older or equal) parts were dropped.
    """
    groups: dict[tuple[str, str], dict[str, PartIn]] = {}
    dropped = 0
    for item in items:
        if item.t != "progress" or item.data is None:
            continue
        parts = groups.setdefault((item.uid, item.hub), {})
        current = parts.get(item.part)
        if current is not None:
            dropped += 1
            if current.upd >= item.data.upd:
                continue
        parts[item.part] = item.data
    return groups, dropped
