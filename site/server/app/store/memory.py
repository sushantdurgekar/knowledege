"""In-process store with Firestore's semantics and billing (tests, e2e and local dev).

- One lock guards every dict, so `put_parts` is as atomic as a Firestore transaction.
- Reads and writes are counted the way Firestore bills them: `get_hub` is 1 read
  (+1 when some part is newer than a non-empty `known`), `put_parts` is 1 read + at
  most 1 write (+1 read on a hub's first write: the tombstone check).
- Fault hooks: `fail_next(op, exc, count=1)` raises `exc` from the next `count` calls of
  `op` ("any" matches every operation) and `latency_ms` sleeps before each call.
- M2 scans (`iter_*`, `storage_scan`) page by document id like the Firestore cursors
  and bill 1 read per document returned (at least 1 per page query).
- Refuses to exist when APP_ENV=production.
"""

from __future__ import annotations

import gzip
import heapq
import json
import threading
import time
from collections.abc import Callable, Iterable, Iterator
from copy import deepcopy
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime, timedelta
from typing import Any

from app.progress.decide import decide
from app.store.base import (
    COUNT_KINDS,
    PARTS,
    AccountDeleted,
    HubSummary,
    LaterMethods,
    OpCounter,
    PartIn,
    PartInfo,
    PartOut,
    PartResult,
    Tombstone,
    UserRecord,
    check_setting_version,
    merged_done,
    progress_doc_id,
    progress_range,
    tombstone_hash,
)

LOGIN_TOUCH_INTERVAL = timedelta(hours=24)
# Approximate bytes of a stored part beyond its gzip payload (field names, stamps).
PART_OVERHEAD = 24


@dataclass
class _StoredPart:
    upd: int
    gz: bytes
    raw_len: int


@dataclass
class _ProgressDoc:
    uid: str
    hub: str
    parts: dict[str, _StoredPart] = field(default_factory=dict)
    done: int | None = None
    t: int = 0  # ms of the last write


class MemoryStore(LaterMethods):
    kind = "memory"

    def __init__(self, *, app_env: str | None = None) -> None:
        if app_env == "production":
            raise RuntimeError("STORE=memory is refused when APP_ENV=production")
        self.ops = OpCounter()
        self.latency_ms = 0
        self._lock = threading.RLock()
        self._users: dict[str, UserRecord] = {}
        self._progress: dict[str, _ProgressDoc] = {}
        self._usage: dict[str, dict[str, int]] = {}
        self._settings: dict[str, tuple[dict[str, Any], int]] = {}
        self._tombstones: dict[str, datetime] = {}
        self._jobs: dict[str, dict[str, Any]] = {}
        self._faults: list[list[Any]] = []  # [op, exc, remaining]

    # -- fault hooks ---------------------------------------------------------------

    def fail_next(self, op: str, exc: BaseException, count: int = 1) -> None:
        with self._lock:
            self._faults.append([op, exc, count])

    def _enter(self, op: str) -> None:
        if self.latency_ms:
            time.sleep(self.latency_ms / 1000)
        with self._lock:
            for fault in self._faults:
                if fault[0] in (op, "any") and fault[2] > 0:
                    fault[2] -= 1
                    exc = fault[1]
                    self._faults = [f for f in self._faults if f[2] > 0]
                    raise exc

    def reset(self) -> None:
        """Wipe all data, faults and counters (test route `POST /api/test/reset`)."""
        with self._lock:
            self._users.clear()
            self._progress.clear()
            self._usage.clear()
            self._settings.clear()
            self._tombstones.clear()
            self._jobs.clear()
            self._faults.clear()
            self.latency_ms = 0
        self.ops.reset()

    def close(self) -> None:
        return None

    # -- health and users ------------------------------------------------------------

    def ping(self) -> None:
        self._enter("ping")
        self.ops.add(reads=1)

    def upsert_user(self, u: UserRecord, *, touch_login: bool) -> None:
        self._enter("upsert_user")
        now = u.last_login_at or datetime.now(UTC)
        with self._lock:
            current = self._users.get(u.uid)
            self.ops.add(reads=1)
            if current is None:
                self._users[u.uid] = replace(u, created_at=now, last_login_at=now if touch_login else None)
                self.ops.add(writes=1)
                return
            updated = replace(
                current,
                email=u.email,
                email_verified=u.email_verified,
                name=u.name,
                photo=u.photo,
                provider=u.provider,
            )
            last = current.last_login_at
            if touch_login and (last is None or now - last >= LOGIN_TOUCH_INTERVAL):
                updated = replace(updated, last_login_at=now)
            if updated != current:
                self._users[u.uid] = updated
                self.ops.add(writes=1)

    def get_user(self, uid: str) -> UserRecord | None:
        self._enter("get_user")
        with self._lock:
            self.ops.add(reads=1)
            return self._users.get(uid)

    def count_users(self) -> int:
        self._enter("count_users")
        with self._lock:
            n = len(self._users)
        self.ops.add(reads=max(1, -(-n // 1000)))
        return n

    # -- progress ----------------------------------------------------------------------

    def get_hub(self, uid: str, hub: str, known: dict[str, int]) -> dict[str, PartOut]:
        self._enter("get_hub")
        with self._lock:
            doc = self._progress.get(progress_doc_id(uid, hub))
            # Nothing known yet: one full read (as the Firestore adapter does).
            single = not any(v > 0 for v in known.values())
            if doc is None:
                self.ops.add(reads=1)
                return {}
            out: dict[str, PartOut] = {}
            newer = 0
            for part, stored in doc.parts.items():
                if stored.upd > known.get(part, 0):
                    out[part] = PartOut(stored.upd, stored.gz)
                    newer += len(stored.gz) + PART_OVERHEAD
                else:
                    out[part] = PartOut(stored.upd, None)
            if single:
                self.ops.add(reads=1, fs_egress=_stamps_size(doc) + newer)
            else:
                self.ops.add(reads=1, fs_egress=_stamps_size(doc))
                if newer:
                    self.ops.add(reads=1, fs_egress=_stamps_size(doc) + newer)
            return out

    def put_parts(self, uid: str, hub: str, parts: dict[str, PartIn], now_ms: int) -> dict[str, PartResult]:
        self._enter("put_parts")
        doc_id = progress_doc_id(uid, hub)
        with self._lock:
            doc = self._progress.get(doc_id)
            self.ops.add(reads=1, fs_egress=_stamps_size(doc))
            if doc is None:  # a hub's first write: refuse a deleted account (+1 read)
                self.ops.add(reads=1)
                if tombstone_hash(uid) in self._tombstones:
                    raise AccountDeleted("the account was deleted")
            stored = {p: s.upd for p, s in doc.parts.items()} if doc else {}
            results: dict[str, PartResult] = {}
            accepted: set[str] = set()
            for part, incoming in parts.items():
                status = decide(stored.get(part), incoming.upd)
                if status == "accepted":
                    accepted.add(part)
                    results[part] = PartResult(status, incoming.upd)
                else:
                    results[part] = PartResult(status, stored[part])
            if accepted:
                if doc is None:
                    doc = self._progress[doc_id] = _ProgressDoc(uid=uid, hub=hub)
                for part in accepted:
                    p = parts[part]
                    doc.parts[part] = _StoredPart(p.upd, p.gz, p.raw_len)
                done = merged_done(parts, accepted)
                if done is not None:
                    doc.done = done
                doc.t = now_ms
                self.ops.add(writes=1)
            return results

    # -- usage and settings ------------------------------------------------------------

    def add_usage(self, day: str, deltas: dict[str, int]) -> None:
        self._enter("add_usage")
        with self._lock:
            row = self._usage.setdefault(day, {})
            for name, value in deltas.items():
                row[name] = row.get(name, 0) + int(value)
            self.ops.add(writes=1)

    def get_usage(self, keys: list[str]) -> dict[str, dict[str, int]]:
        self._enter("get_usage")
        with self._lock:
            self.ops.add(reads=len(keys))
            return {key: dict(self._usage[key]) for key in keys if key in self._usage}

    def get_setting(self, key: str) -> tuple[dict[str, Any], int] | None:
        self._enter("get_setting")
        with self._lock:
            self.ops.add(reads=1)
            found = self._settings.get(key)
            return (deepcopy(found[0]), found[1]) if found else None

    def put_setting(self, key: str, value: dict[str, Any], *, expect_version: int | None) -> int:
        self._enter("put_setting")
        with self._lock:
            self.ops.add(reads=1)
            current = self._settings.get(key)
            version = check_setting_version(current[1] if current else None, expect_version)
            self._settings[key] = (deepcopy(value), version)
            self.ops.add(writes=1)
            return version

    # -- M2: account ----------------------------------------------------------------------

    def _user_doc_ids(self, uid: str) -> list[str]:
        start, end = progress_range(uid)
        return sorted(k for k in self._progress if start <= k < end)

    def list_hubs(self, uid: str, *, payloads: bool = False) -> list[HubSummary]:
        """Every hub doc of `uid` (an id-range query: 1 read per doc, at least 1)."""
        self._enter("list_hubs")
        out: list[HubSummary] = []
        egress = 0
        with self._lock:
            for key in self._user_doc_ids(uid):
                doc = self._progress[key]
                parts: dict[str, PartInfo] = {}
                for part in PARTS:
                    stored = doc.parts.get(part)
                    if stored is not None:
                        parts[part] = PartInfo(stored.upd, stored.raw_len, stored.gz if payloads else None)
                        egress += 24 + (len(stored.gz) if payloads else 0)
                out.append(HubSummary(doc.hub, parts, doc.done))
        self.ops.add(reads=max(1, len(out)), fs_egress=egress)
        return out

    def delete_user(self, uid: str) -> int:
        """Delete every progress doc of `uid`, then the user doc. Safe to repeat."""
        self._enter("delete_user")
        with self._lock:
            keys = self._user_doc_ids(uid)
            self.ops.add(reads=max(1, len(keys)))
            for key in keys:
                del self._progress[key]
            self._users.pop(uid, None)
        self.ops.add(deletes=len(keys) + 1)
        return len(keys)

    def put_tombstone(self, h: str, at: datetime) -> None:
        self._enter("put_tombstone")
        with self._lock:
            self._tombstones.setdefault(h, at)
        self.ops.add(writes=1)

    def is_tombstoned(self, uid_hashes: list[str]) -> set[str]:
        self._enter("is_tombstoned")
        with self._lock:
            found = {h for h in uid_hashes if h in self._tombstones}
        self.ops.add(reads=len(uid_hashes))
        return found

    def count_docs(self, kind: str) -> int:
        """`count()` aggregation of users, progress or tombstones (1 read per 1,000)."""
        if kind not in COUNT_KINDS:
            raise ValueError(f"unknown collection {kind!r}")
        if kind == "users":
            return self.count_users()
        self._enter("count_docs")
        with self._lock:
            n = len(self._progress if kind == "progress" else self._tombstones)
        self.ops.add(reads=max(1, -(-n // 1000)))
        return n

    # -- M2: scans by document id (backups, storage estimate) --------------------------

    def _pages(self, op: str, table: dict[str, Any], page: int) -> Iterator[list[str]]:
        """Pages of keys after a document-id cursor, as Firestore's start_after + limit."""
        if page < 1:
            raise ValueError("page must be positive")
        cursor: str | None = None
        while True:
            self._enter(op)
            with self._lock:
                keys = heapq.nsmallest(page, _after(table, cursor))
            self.ops.add(reads=max(1, len(keys)))
            if keys:
                yield keys
            if len(keys) < page:
                return
            cursor = keys[-1]

    def iter_users(self, page: int = 300) -> Iterator[UserRecord]:
        for keys in self._pages("iter_users", self._users, page):
            with self._lock:
                batch = [self._users[k] for k in keys if k in self._users]
            yield from batch

    def iter_progress(self, page: int = 300) -> Iterator[tuple[str, str, dict[str, PartOut]]]:
        for keys in self._pages("iter_progress", self._progress, page):
            with self._lock:
                docs = [self._progress[k] for k in keys if k in self._progress]
                batch = [
                    (d.uid, d.hub, {p: PartOut(d.parts[p].upd, d.parts[p].gz) for p in PARTS if p in d.parts})
                    for d in docs
                ]
            yield from batch

    def iter_tombstones(self, page: int = 300) -> Iterator[Tombstone]:
        for keys in self._pages("iter_tombstones", self._tombstones, page):
            with self._lock:
                batch = [Tombstone(k, self._tombstones[k]) for k in keys if k in self._tombstones]
            yield from batch

    def storage_scan(self, page: int = 300) -> tuple[int, int]:
        """(docs, sum of every n_<part>): the storage estimate (1 read per doc)."""
        docs = total = 0
        for keys in self._pages("storage_scan", self._progress, page):
            with self._lock:
                for key in keys:
                    doc = self._progress.get(key)
                    if doc is not None:
                        docs += 1
                        total += sum(p.raw_len for p in doc.parts.values())
        return docs, total

    # -- M2: jobs -------------------------------------------------------------------------

    def get_job(self, id: str) -> dict[str, Any] | None:
        self._enter("get_job")
        with self._lock:
            self.ops.add(reads=1)
            job = self._jobs.get(id)
            return deepcopy(job) if job is not None else None

    def put_job(self, job: dict[str, Any]) -> None:
        self._enter("put_job")
        with self._lock:
            self._jobs[str(job["id"])] = deepcopy(job)
        self.ops.add(writes=1)

    def claim_job(self, id: str, holder: str, from_states: set[str], *, to_state: str = "running") -> bool:
        """Atomically move a job from one of `from_states` to `to_state`, held by `holder`."""
        self._enter("claim_job")
        with self._lock:
            self.ops.add(reads=1)
            job = self._jobs.get(id)
            if job is None or job.get("state") not in from_states:
                return False
            job.update(_transition(to_state, holder))
            self.ops.add(writes=1)
            return True

    def list_jobs(self, states: set[str] | None = None, limit: int = 50) -> list[dict[str, Any]]:
        """Jobs in `states` (oldest first), or the newest `limit` jobs when no states."""
        self._enter("list_jobs")
        with self._lock:
            if states:
                ids = sorted(k for k, j in self._jobs.items() if j.get("state") in states)[:limit]
            else:  # newest first by createdAt, like the Firestore query (jobs without it are skipped)
                dated = [j for j in self._jobs.values() if isinstance(j.get("createdAt"), str)]
                dated.sort(key=lambda j: (j["createdAt"], j["id"]), reverse=True)
                ids = [j["id"] for j in dated[:limit]]
            jobs = [deepcopy(self._jobs[k]) for k in ids]
        self.ops.add(reads=max(1, len(jobs)))
        return jobs

    # -- test support --------------------------------------------------------------------

    def dump(self, decode: Callable[[bytes], Any] | None = None) -> dict[str, Any]:
        """Everything in the store, progress decoded (`GET /api/test/store`). Not billed."""
        decode = decode or _decode_gz
        with self._lock:
            users = [
                {
                    "uid": u.uid,
                    "email": u.email,
                    "emailVerified": u.email_verified,
                    "name": u.name,
                    "photo": u.photo,
                    "provider": u.provider,
                    "createdAt": _iso(u.created_at),
                    "lastLoginAt": _iso(u.last_login_at),
                }
                for u in sorted(self._users.values(), key=lambda r: r.uid)
            ]
            progress = []
            for doc in sorted(self._progress.values(), key=lambda d: (d.uid, d.hub)):
                for part in PARTS:
                    stored = doc.parts.get(part)
                    if stored is not None:
                        progress.append(
                            {
                                "uid": doc.uid,
                                "hub": doc.hub,
                                "part": part,
                                "upd": stored.upd,
                                "data": decode(stored.gz),
                                "rawLen": stored.raw_len,
                                "done": doc.done,
                            }
                        )
            usage = {key: dict(value) for key, value in sorted(self._usage.items())}
            tombstones = [{"h": h, "at": _iso(at)} for h, at in sorted(self._tombstones.items())]
        return {"users": users, "progress": progress, "usage": usage, "tombstones": tombstones}


def _transition(to_state: str, holder: str) -> dict[str, Any]:
    now = _iso(datetime.now(UTC))
    fields: dict[str, Any] = {"state": to_state, "holder": holder, "updatedAt": now}
    if to_state == "running":
        fields["claimedAt"] = now
    return fields


def _after(table: dict[str, Any], cursor: str | None) -> Iterable[str]:
    return table.keys() if cursor is None else (k for k in table if k > cursor)


def _decode_gz(blob: bytes) -> Any:
    return json.loads(gzip.decompress(blob))


def _stamps_size(doc: _ProgressDoc | None) -> int:
    if doc is None:
        return 0
    return 16 * len(doc.parts) + 32


def _iso(moment: datetime | None) -> str | None:
    return moment.astimezone(UTC).isoformat().replace("+00:00", "Z") if moment else None
