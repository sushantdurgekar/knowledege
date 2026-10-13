"""Firestore store (build-contracts.md section 11, architecture-spec.md section 4.8).

Data model (every field top-level and index-exempt, see site/firebase/):

    users/{uid}              email, emailVerified, name, photo, provider, createdAt, lastLoginAt
    progress/{uid}~{hubId}   uid, hub, u_<part> (int), p_<part> (bytes, gzip of compact JSON),
                             n_<part> (raw length), done (int), t (server timestamp)
    usage/{YYYY-MM-DD}       reads, writes, deletes, fsEgress, appEgress  (Increment)
    meta/{key}               the setting's fields plus `v` (optimistic version)
    tombstones/{sha256 hex}  at                                (M2: deleted accounts)
    jobs/{j<ms>-<hex>}       state, kind, mode, startAt, ...   (M2: scheduled jobs)

M2 scans (`iter_*`, `storage_scan`) are document-id cursors: `order_by(__name__)`,
`start_after(<last id>)`, `limit(page)`, never offsets, so a page costs exactly its
documents (1 read for an empty page). `list_hubs` and `delete_user` are one id-range
query over `{uid}~` .. `{uid}\x7f`.

Cost per operation: `get_hub` 1 read (+1 only when some part is newer than a
non-empty `known`; with nothing known it is one read with the full field mask);
`put_parts` 1 read + at most 1 write, in one transaction that reads only the `u_*`
stamps through a field mask; a hub's first write (no document yet) also reads the
uid's tombstone in that transaction (+1 read) and raises `AccountDeleted` if it exists.

Every RPC carries `timeout=10` and a short `Retry` that never retries
`ResourceExhausted`; the transaction's own begin/commit/rollback RPCs are bounded the
same way (the library's defaults would retry `ResourceExhausted` for 60 s).
`ResourceExhausted` becomes `QuotaExhausted(kind, next Pacific midnight)`;
`ServiceUnavailable`, `DeadlineExceeded`, `RetryError` and other transport failures
become `Unavailable`.

The client is created lazily on the first call, so a server whose credentials are
broken still starts and answers /healthz and the hubs.
"""

from __future__ import annotations

import logging
import threading
import urllib.request
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from typing import Any

from google.api_core import exceptions as gexc
from google.api_core.retry import Retry, if_exception_type
from google.auth import exceptions as auth_exc
from google.cloud.firestore_v1 import Increment
from google.cloud.firestore_v1.base_query import FieldFilter
from google.cloud.firestore_v1.client import Client
from google.cloud.firestore_v1.field_path import FieldPath
from google.cloud.firestore_v1.query import Query
from google.cloud.firestore_v1.transaction import Transaction, transactional
from google.cloud.firestore_v1.transforms import SERVER_TIMESTAMP

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
    QuotaExhausted,
    StoreError,
    Tombstone,
    TooLarge,
    Unavailable,
    UserRecord,
    check_setting_version,
    merged_done,
    progress_doc_id,
    progress_range,
    tombstone_hash,
)

logger = logging.getLogger(__name__)

TIMEOUT = 10.0
RETRY = Retry(
    predicate=if_exception_type(gexc.ServiceUnavailable, gexc.DeadlineExceeded, gexc.InternalServerError),
    initial=0.2,
    maximum=2.0,
    multiplier=2.0,
    timeout=8.0,
)
TX_ATTEMPTS = 3
LOGIN_TOUCH_INTERVAL = timedelta(hours=24)
STAMP_FIELDS = [f"u_{p}" for p in PARTS]
PAYLOAD_FIELDS = [f"p_{p}" for p in PARTS]
SIZE_FIELDS = [f"n_{p}" for p in PARTS]
DOC_ID = FieldPath.document_id()
BATCH_DELETES = 400
USER_FIELDS = ["email", "emailVerified", "name", "photo", "provider", "createdAt", "lastLoginAt"]
# Rough serialized size of a document read through the stamp mask (egress estimate).
STAMPS_BYTES = 16 * len(PARTS) + 32
_SIZE_HINTS = ("exceeds the maximum", "too big", "too large", "maximum allowed size", "longer than")


class _BoundedTransaction(Transaction):
    """A Transaction whose begin/commit/rollback RPCs carry our timeout and retry."""

    def _begin(self, retry_id: bytes | None = None) -> None:
        if self.in_progress:
            raise ValueError("transaction already in progress")
        response = self._client._firestore_api.begin_transaction(
            request={
                "database": self._client._database_string,
                "options": self._options_protobuf(retry_id),
            },
            metadata=self._client._rpc_metadata,
            retry=RETRY,
            timeout=TIMEOUT,
        )
        self._id = response.transaction

    def _rollback(self) -> None:
        if not self.in_progress:
            raise ValueError("no transaction in progress")
        try:
            self._client._firestore_api.rollback(
                request={"database": self._client._database_string, "transaction": self._id},
                metadata=self._client._rpc_metadata,
                retry=RETRY,
                timeout=TIMEOUT,
            )
        finally:
            self._clean_up()

    def _commit(self) -> list[Any]:
        if not self.in_progress:
            raise ValueError("no transaction in progress")
        response = self._client._firestore_api.commit(
            request={
                "database": self._client._database_string,
                "writes": self._write_pbs,
                "transaction": self._id,
            },
            metadata=self._client._rpc_metadata,
            retry=RETRY,
            timeout=TIMEOUT,
        )
        self._clean_up()
        self.write_results = list(response.write_results)
        self.commit_time = response.commit_time
        return self.write_results


def _chain(exc: BaseException) -> Iterator[BaseException]:
    seen: set[int] = set()
    current: BaseException | None = exc
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        yield current
        current = current.__cause__ or current.__context__


class FirestoreStore(LaterMethods):
    kind = "firestore"

    def __init__(
        self,
        *,
        project_id: str,
        reset_at: Callable[[], datetime],
        credentials_file: str | None = None,
        credentials_info: dict[str, Any] | None = None,
        emulator_host: str | None = None,
        client: Client | None = None,
    ) -> None:
        self.ops = OpCounter()
        self._project_id = project_id
        self._reset_at = reset_at
        self._credentials_file = credentials_file
        self._credentials_info = credentials_info
        self._emulator_host = emulator_host
        self._db: Client | None = client
        self._lock = threading.Lock()

    # -- client ----------------------------------------------------------------------

    def _make_client(self) -> Client:
        if self._emulator_host:
            from google.auth.credentials import AnonymousCredentials

            client = Client(project=self._project_id, credentials=AnonymousCredentials())
            client._emulator_host = self._emulator_host  # the library only reads the env var
            return client
        credentials = None
        if self._credentials_file or self._credentials_info:
            from google.oauth2 import service_account

            scopes = ["https://www.googleapis.com/auth/datastore"]
            if self._credentials_file:
                credentials = service_account.Credentials.from_service_account_file(
                    self._credentials_file, scopes=scopes
                )
            else:
                credentials = service_account.Credentials.from_service_account_info(
                    self._credentials_info, scopes=scopes
                )
        return Client(project=self._project_id, credentials=credentials)  # ADC when None

    @property
    def db(self) -> Client:
        if self._db is None:
            with self._lock:
                if self._db is None:
                    with self._mapped("reads"):
                        self._db = self._make_client()
        return self._db

    def close(self) -> None:
        if self._db is not None:
            try:
                self._db.close()
            except Exception:
                logger.debug("Firestore client close failed", exc_info=True)

    # -- error mapping ---------------------------------------------------------------

    @contextmanager
    def _mapped(self, kind: str) -> Iterator[None]:
        try:
            yield
        except StoreError:
            raise
        except Exception as exc:
            raise self._translate(exc, kind) from exc

    def _translate(self, exc: BaseException, kind: str) -> StoreError:
        chain = list(_chain(exc))
        for item in chain:
            if isinstance(item, gexc.ResourceExhausted):
                logger.warning("Firestore ResourceExhausted (%s): %s", kind, item)
                return QuotaExhausted(kind, self._reset_at(), str(item.message or "quota exhausted"))
        for item in chain:
            if isinstance(item, gexc.InvalidArgument) and any(
                hint in str(item).lower() for hint in _SIZE_HINTS
            ):
                return TooLarge(str(item))
        for item in chain:
            if isinstance(
                item,
                gexc.ServiceUnavailable
                | gexc.DeadlineExceeded
                | gexc.RetryError
                | gexc.InternalServerError
                | gexc.Aborted
                | auth_exc.GoogleAuthError,
            ):
                logger.warning("Firestore unavailable (%s): %s", kind, item)
                return Unavailable(str(item))
        if isinstance(exc, ValueError) and "attempts" in str(exc):
            return Unavailable("transaction contention: " + str(exc))  # max_attempts exhausted
        logger.error("Firestore error (%s): %r", kind, exc)
        return Unavailable(f"Firestore error: {type(exc).__name__}")

    # -- health and users ------------------------------------------------------------

    def ping(self) -> None:
        with self._mapped("reads"):
            self.db.collection("meta").document("settings").get(
                field_paths=["v"], retry=RETRY, timeout=TIMEOUT
            )
        self.ops.add(reads=1)

    def upsert_user(self, u: UserRecord, *, touch_login: bool) -> None:
        now = u.last_login_at or datetime.now(UTC)
        ref = self.db.collection("users").document(u.uid)
        with self._mapped("reads"):
            snap = ref.get(field_paths=USER_FIELDS, retry=RETRY, timeout=TIMEOUT)
        self.ops.add(reads=1, fs_egress=128)
        profile = {
            "email": u.email,
            "emailVerified": bool(u.email_verified),
            "name": u.name,
            "photo": u.photo,
            "provider": u.provider,
        }
        if not snap.exists:
            data: dict[str, Any] = {**profile, "createdAt": now, "lastLoginAt": now if touch_login else None}
        else:
            current = snap.to_dict() or {}
            data = {k: v for k, v in profile.items() if current.get(k) != v}
            last = current.get("lastLoginAt")
            if touch_login and (not isinstance(last, datetime) or now - last >= LOGIN_TOUCH_INTERVAL):
                data["lastLoginAt"] = now
            if not data:
                return
        with self._mapped("writes"):
            ref.set(data, merge=True, retry=RETRY, timeout=TIMEOUT)
        self.ops.add(writes=1)

    def get_user(self, uid: str) -> UserRecord | None:
        with self._mapped("reads"):
            snap = self.db.collection("users").document(uid).get(retry=RETRY, timeout=TIMEOUT)
        self.ops.add(reads=1, fs_egress=128)
        if not snap.exists:
            return None
        return _user_record(uid, snap.to_dict() or {})

    def count_users(self) -> int:
        with self._mapped("reads"):
            result = self.db.collection("users").count().get(retry=RETRY, timeout=TIMEOUT)
        n = int(result[0][0].value)
        self.ops.add(reads=max(1, -(-n // 1000)))
        return n

    # -- progress --------------------------------------------------------------------

    def _progress_ref(self, uid: str, hub: str) -> Any:
        return self.db.collection("progress").document(progress_doc_id(uid, hub))

    def get_hub(self, uid: str, hub: str, known: dict[str, int]) -> dict[str, PartOut]:
        ref = self._progress_ref(uid, hub)
        if not any(v > 0 for v in known.values()):
            # Nothing known yet (first load, the legacy seed): every stored part is
            # newer, so one read with the full mask beats stamps-then-payloads.
            with self._mapped("reads"):
                snap = ref.get(field_paths=STAMP_FIELDS + PAYLOAD_FIELDS, retry=RETRY, timeout=TIMEOUT)
            data = (snap.to_dict() or {}) if snap.exists else {}
            out: dict[str, PartOut] = {}
            egress = STAMPS_BYTES if snap.exists else 0
            for part, upd in _stamps(data).items():
                blob = data.get(f"p_{part}")
                if isinstance(blob, bytes):
                    out[part] = PartOut(upd, blob)
                    egress += len(blob)
            self.ops.add(reads=1, fs_egress=egress)
            return out
        with self._mapped("reads"):
            snap = ref.get(field_paths=STAMP_FIELDS, retry=RETRY, timeout=TIMEOUT)
        self.ops.add(reads=1, fs_egress=STAMPS_BYTES if snap.exists else 0)
        if not snap.exists:
            return {}
        stamps = _stamps(snap.to_dict())
        changed = [p for p, upd in stamps.items() if upd > known.get(p, 0)]
        out = {p: PartOut(upd, None) for p, upd in stamps.items()}
        if not changed:
            return out
        with self._mapped("reads"):
            full = ref.get(
                field_paths=STAMP_FIELDS + [f"p_{p}" for p in changed], retry=RETRY, timeout=TIMEOUT
            )
        data = (full.to_dict() or {}) if full.exists else {}
        egress = STAMPS_BYTES
        latest = _stamps(data)
        for part in changed:
            blob = data.get(f"p_{part}")
            upd = latest.get(part)
            if isinstance(blob, bytes) and upd is not None and upd > known.get(part, 0):
                out[part] = PartOut(upd, blob)
                egress += len(blob)
            elif upd is None:
                out.pop(part, None)  # vanished between the two reads
            # otherwise keep the first read's stub: never a stub newer than `known`
        self.ops.add(reads=1, fs_egress=egress)
        return out

    def put_parts(self, uid: str, hub: str, parts: dict[str, PartIn], now_ms: int) -> dict[str, PartResult]:
        ref = self._progress_ref(uid, hub)
        tomb_ref = self.db.collection("tombstones").document(tombstone_hash(uid))
        outcome: dict[str, Any] = {}

        def run(tx: Transaction) -> dict[str, PartResult]:
            outcome["phase"] = "reads"
            snap = ref.get(field_paths=STAMP_FIELDS, transaction=tx, retry=RETRY, timeout=TIMEOUT)
            self.ops.add(reads=1, fs_egress=STAMPS_BYTES if snap.exists else 0)
            if not snap.exists:  # a hub's first write: refuse a deleted account (+1 read)
                tomb = tomb_ref.get(field_paths=["at"], transaction=tx, retry=RETRY, timeout=TIMEOUT)
                self.ops.add(reads=1)
                if tomb.exists:
                    raise AccountDeleted("the account was deleted")
            stored = _stamps(snap.to_dict()) if snap.exists else {}
            results: dict[str, PartResult] = {}
            accepted: set[str] = set()
            update: dict[str, Any] = {}
            for part, incoming in parts.items():
                status = decide(stored.get(part), incoming.upd)
                if status == "accepted":
                    accepted.add(part)
                    results[part] = PartResult(status, incoming.upd)
                    update[f"u_{part}"] = incoming.upd
                    update[f"p_{part}"] = incoming.gz
                    update[f"n_{part}"] = incoming.raw_len
                else:
                    results[part] = PartResult(status, stored[part])
            if update:
                done = merged_done(parts, accepted)
                if done is not None:
                    update["done"] = done
                update.update({"uid": uid, "hub": hub, "t": SERVER_TIMESTAMP})
                tx.set(ref, update, merge=True)
            outcome["write"] = bool(update)
            outcome["phase"] = "writes"
            return results

        tx = _BoundedTransaction(self.db, max_attempts=TX_ATTEMPTS)
        try:
            results = transactional(run)(tx)
        except StoreError:
            raise
        except Exception as exc:
            raise self._translate(exc, outcome.get("phase", "reads")) from exc
        if outcome.get("write"):
            self.ops.add(writes=1)
        return results

    # -- usage and settings ------------------------------------------------------------

    def add_usage(self, day: str, deltas: dict[str, int]) -> None:
        fields = {name: Increment(int(value)) for name, value in deltas.items() if value}
        if not fields:
            return
        with self._mapped("writes"):
            self.db.collection("usage").document(day).set(fields, merge=True, retry=RETRY, timeout=TIMEOUT)
        self.ops.add(writes=1)

    def get_usage(self, keys: list[str]) -> dict[str, dict[str, int]]:
        if not keys:
            return {}
        refs = [self.db.collection("usage").document(key) for key in keys]
        out: dict[str, dict[str, int]] = {}
        with self._mapped("reads"):
            for snap in self.db.get_all(refs, retry=RETRY, timeout=TIMEOUT):
                if snap.exists:
                    out[snap.id] = {
                        k: int(v) for k, v in (snap.to_dict() or {}).items() if isinstance(v, int)
                    }
        self.ops.add(reads=len(keys), fs_egress=64 * len(out))
        return out

    def get_setting(self, key: str) -> tuple[dict[str, Any], int] | None:
        with self._mapped("reads"):
            snap = self.db.collection("meta").document(key).get(retry=RETRY, timeout=TIMEOUT)
        self.ops.add(reads=1, fs_egress=256 if snap.exists else 0)
        if not snap.exists:
            return None
        data = snap.to_dict() or {}
        version = int(data.pop("v", 0))
        return data, version

    def put_setting(self, key: str, value: dict[str, Any], *, expect_version: int | None) -> int:
        if "v" in value:
            raise ValueError("setting values must not use the reserved field 'v'")
        ref = self.db.collection("meta").document(key)
        outcome: dict[str, Any] = {}

        def run(tx: Transaction) -> int:
            outcome["phase"] = "reads"
            snap = ref.get(field_paths=["v"], transaction=tx, retry=RETRY, timeout=TIMEOUT)
            self.ops.add(reads=1)
            current = int((snap.to_dict() or {}).get("v", 0)) if snap.exists else None
            version = check_setting_version(current, expect_version)  # raises Conflict
            tx.set(ref, {**value, "v": version})
            outcome["phase"] = "writes"
            return version

        tx = _BoundedTransaction(self.db, max_attempts=TX_ATTEMPTS)
        try:
            version = transactional(run)(tx)
        except StoreError:
            raise
        except Exception as exc:
            raise self._translate(exc, outcome.get("phase", "reads")) from exc
        self.ops.add(writes=1)
        return version

    # -- M2: account ----------------------------------------------------------------------

    def _user_range(self, uid: str, fields: list[str]) -> Query:
        start, end = progress_range(uid)
        return (
            self.db.collection("progress")
            .order_by(DOC_ID)
            .start_at({DOC_ID: start})
            .end_before({DOC_ID: end})
            .select(fields)
        )

    def list_hubs(self, uid: str, *, payloads: bool = False) -> list[HubSummary]:
        fields = ["hub", "done", *STAMP_FIELDS, *SIZE_FIELDS, *(PAYLOAD_FIELDS if payloads else [])]
        with self._mapped("reads"):
            snaps = self._user_range(uid, fields).get(retry=RETRY, timeout=TIMEOUT)
        out: list[HubSummary] = []
        egress = 0
        for snap in snaps:
            d = snap.to_dict() or {}
            parts: dict[str, PartInfo] = {}
            for part, upd in _stamps(d).items():
                blob = d.get(f"p_{part}") if payloads else None
                size = d.get(f"n_{part}")
                parts[part] = PartInfo(
                    upd, int(size) if isinstance(size, int) else 0, blob if isinstance(blob, bytes) else None
                )
                egress += 24 + (len(blob) if isinstance(blob, bytes) else 0)
            done = d.get("done")
            hub = d.get("hub") or snap.id.split("~", 1)[-1]
            out.append(HubSummary(str(hub), parts, done if isinstance(done, int) else None))
        self.ops.add(reads=max(1, len(snaps)), fs_egress=egress)
        return out

    def delete_user(self, uid: str) -> int:
        with self._mapped("reads"):
            snaps = self._user_range(uid, []).get(retry=RETRY, timeout=TIMEOUT)
        self.ops.add(reads=max(1, len(snaps)))
        refs = [snap.reference for snap in snaps]
        refs.append(self.db.collection("users").document(uid))  # last: the account goes after its data
        with self._mapped("deletes"):
            for start in range(0, len(refs), BATCH_DELETES):
                batch = self.db.batch()
                for ref in refs[start : start + BATCH_DELETES]:
                    batch.delete(ref)
                batch.commit(retry=RETRY, timeout=TIMEOUT)
                self.ops.add(deletes=len(refs[start : start + BATCH_DELETES]))
        return len(snaps)

    def put_tombstone(self, h: str, at: datetime) -> None:
        with self._mapped("writes"):
            self.db.collection("tombstones").document(h).set({"at": at}, retry=RETRY, timeout=TIMEOUT)
        self.ops.add(writes=1)

    def is_tombstoned(self, uid_hashes: list[str]) -> set[str]:
        if not uid_hashes:
            return set()
        refs = [self.db.collection("tombstones").document(h) for h in uid_hashes]
        with self._mapped("reads"):
            found = {
                snap.id
                for snap in self.db.get_all(refs, field_paths=["at"], retry=RETRY, timeout=TIMEOUT)
                if snap.exists
            }
        self.ops.add(reads=len(uid_hashes))
        return found

    def count_docs(self, kind: str) -> int:
        if kind not in COUNT_KINDS:
            raise ValueError(f"unknown collection {kind!r}")
        with self._mapped("reads"):
            result = self.db.collection(kind).count().get(retry=RETRY, timeout=TIMEOUT)
        n = int(result[0][0].value)
        self.ops.add(reads=max(1, -(-n // 1000)))
        return n

    # -- M2: scans by document id ------------------------------------------------------------

    def _pages(self, collection: str, page: int, fields: list[str] | None) -> Iterator[list[Any]]:
        if page < 1:
            raise ValueError("page must be positive")
        cursor: str | None = None
        while True:
            query = self.db.collection(collection).order_by(DOC_ID)
            if fields is not None:
                query = query.select(fields)
            if cursor is not None:
                query = query.start_after({DOC_ID: cursor})
            with self._mapped("reads"):
                snaps = query.limit(page).get(retry=RETRY, timeout=TIMEOUT)
            self.ops.add(reads=max(1, len(snaps)))
            if snaps:
                yield snaps
            if len(snaps) < page:
                return
            cursor = snaps[-1].id

    def iter_users(self, page: int = 300) -> Iterator[UserRecord]:
        for snaps in self._pages("users", page, USER_FIELDS):
            self.ops.add(fs_egress=128 * len(snaps))
            for snap in snaps:
                yield _user_record(snap.id, snap.to_dict() or {})

    def iter_progress(self, page: int = 300) -> Iterator[tuple[str, str, dict[str, PartOut]]]:
        for snaps in self._pages("progress", page, ["uid", "hub", *STAMP_FIELDS, *PAYLOAD_FIELDS]):
            batch = []
            egress = 0
            for snap in snaps:
                d = snap.to_dict() or {}
                parts: dict[str, PartOut] = {}
                for part, upd in _stamps(d).items():
                    blob = d.get(f"p_{part}")
                    if isinstance(blob, bytes):
                        parts[part] = PartOut(upd, blob)
                        egress += len(blob)
                uid, _, hub = snap.id.partition("~")
                batch.append((str(d.get("uid") or uid), str(d.get("hub") or hub), parts))
            self.ops.add(fs_egress=egress + STAMPS_BYTES * len(snaps))
            yield from batch

    def iter_tombstones(self, page: int = 300) -> Iterator[Tombstone]:
        for snaps in self._pages("tombstones", page, ["at"]):
            for snap in snaps:
                at = (snap.to_dict() or {}).get("at")
                yield Tombstone(snap.id, at if isinstance(at, datetime) else datetime.fromtimestamp(0, UTC))

    def storage_scan(self, page: int = 300) -> tuple[int, int]:
        docs = total = 0
        for snaps in self._pages("progress", page, SIZE_FIELDS):
            for snap in snaps:
                docs += 1
                total += sum(v for v in (snap.to_dict() or {}).values() if isinstance(v, int))
        return docs, total

    # -- M2: jobs -------------------------------------------------------------------------

    def get_job(self, id: str) -> dict[str, Any] | None:
        with self._mapped("reads"):
            snap = self.db.collection("jobs").document(id).get(retry=RETRY, timeout=TIMEOUT)
        self.ops.add(reads=1, fs_egress=512 if snap.exists else 0)
        return {**(snap.to_dict() or {}), "id": snap.id} if snap.exists else None

    def put_job(self, job: dict[str, Any]) -> None:
        ref = self.db.collection("jobs").document(str(job["id"]))
        with self._mapped("writes"):
            ref.set(dict(job), retry=RETRY, timeout=TIMEOUT)
        self.ops.add(writes=1)

    def claim_job(self, id: str, holder: str, from_states: set[str], *, to_state: str = "running") -> bool:
        ref = self.db.collection("jobs").document(id)
        outcome: dict[str, Any] = {}

        def run(tx: Transaction) -> bool:
            outcome["phase"] = "reads"
            snap = ref.get(field_paths=["state"], transaction=tx, retry=RETRY, timeout=TIMEOUT)
            self.ops.add(reads=1)
            state = (snap.to_dict() or {}).get("state") if snap.exists else None
            if state not in from_states:
                outcome["write"] = False
                return False
            now = _iso(datetime.now(UTC))
            fields = {"state": to_state, "holder": holder, "updatedAt": now}
            if to_state == "running":
                fields["claimedAt"] = now
            tx.update(ref, fields)
            outcome["write"] = True
            outcome["phase"] = "writes"
            return True

        tx = _BoundedTransaction(self.db, max_attempts=TX_ATTEMPTS)
        try:
            claimed = transactional(run)(tx)
        except StoreError:
            raise
        except Exception as exc:
            raise self._translate(exc, outcome.get("phase", "reads")) from exc
        if outcome.get("write"):
            self.ops.add(writes=1)
        return bool(claimed)

    def list_jobs(self, states: set[str] | None = None, limit: int = 50) -> list[dict[str, Any]]:
        jobs = self.db.collection("jobs")
        if states:
            query = jobs.where(filter=FieldFilter("state", "in", sorted(states))).limit(limit)
        else:
            # No descending key scans in Firestore: newest first by `createdAt` (ISO, indexed).
            query = jobs.order_by("createdAt", direction=Query.DESCENDING).limit(limit)
        with self._mapped("reads"):
            snaps = query.get(retry=RETRY, timeout=TIMEOUT)
        self.ops.add(reads=max(1, len(snaps)), fs_egress=512 * len(snaps))
        out = [{**(snap.to_dict() or {}), "id": snap.id} for snap in snaps]
        if states:
            out.sort(key=lambda job: job["id"])
        return out

    # -- test support (emulator only) ----------------------------------------------------
    # The test-only routes (`POST /api/test/reset`, `GET /api/test/store`, APP_ENV=test) use
    # these so the M1 e2e specs can run against the Firestore emulator as well as the memory
    # store. Both refuse to touch anything but an emulator, and neither is billed.

    def _require_emulator(self) -> str:
        if not self._emulator_host:
            raise StoreError("only available on the Firestore emulator")
        return self._emulator_host

    def reset(self) -> None:
        """Wipe the emulator database and the op counter (`POST /api/test/reset`)."""
        host = self._require_emulator()
        url = f"http://{host}/emulator/v1/projects/{self._project_id}/databases/(default)/documents"
        request = urllib.request.Request(url, method="DELETE")  # the emulator, never a real project
        with urllib.request.urlopen(request, timeout=TIMEOUT):  # noqa: S310
            pass
        self.ops.reset()

    def dump(self, decode: Callable[[bytes], Any]) -> dict[str, Any]:
        """Users, decoded progress and usage, like `MemoryStore.dump` (`GET /api/test/store`)."""
        self._require_emulator()
        users = []
        for snap in self.db.collection("users").stream(timeout=TIMEOUT):
            d = snap.to_dict() or {}
            users.append(
                {
                    "uid": snap.id,
                    "email": d.get("email"),
                    "emailVerified": bool(d.get("emailVerified")),
                    "name": d.get("name"),
                    "photo": d.get("photo"),
                    "provider": d.get("provider"),
                    "createdAt": _iso(d.get("createdAt")),
                    "lastLoginAt": _iso(d.get("lastLoginAt")),
                }
            )
        progress = []
        for snap in self.db.collection("progress").stream(timeout=TIMEOUT):
            d = snap.to_dict() or {}
            for part, upd in _stamps(d).items():
                blob = d.get(f"p_{part}")
                if isinstance(blob, bytes):
                    progress.append(
                        {
                            "uid": d.get("uid"),
                            "hub": d.get("hub"),
                            "part": part,
                            "upd": upd,
                            "data": decode(blob),
                            "rawLen": d.get(f"n_{part}"),
                            "done": d.get("done"),
                        }
                    )
        usage = {
            snap.id: {k: int(v) for k, v in (snap.to_dict() or {}).items() if isinstance(v, int)}
            for snap in self.db.collection("usage").stream(timeout=TIMEOUT)
        }
        tombstones = [
            {"h": snap.id, "at": _iso((snap.to_dict() or {}).get("at"))}
            for snap in self.db.collection("tombstones").stream(timeout=TIMEOUT)
        ]
        users.sort(key=lambda u: u["uid"])
        progress.sort(key=lambda p: (str(p["uid"]), str(p["hub"]), PARTS.index(p["part"])))
        return {
            "users": users,
            "progress": progress,
            "usage": dict(sorted(usage.items())),
            "tombstones": sorted(tombstones, key=lambda t: str(t["h"])),
        }


def _user_record(uid: str, d: dict[str, Any]) -> UserRecord:
    return UserRecord(
        uid=uid,
        email=d.get("email"),
        email_verified=bool(d.get("emailVerified")),
        name=d.get("name"),
        photo=d.get("photo"),
        provider=d.get("provider"),
        created_at=d.get("createdAt") if isinstance(d.get("createdAt"), datetime) else None,
        last_login_at=d.get("lastLoginAt") if isinstance(d.get("lastLoginAt"), datetime) else None,
    )


def _iso(moment: Any) -> str | None:
    if not isinstance(moment, datetime):
        return None
    return moment.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _stamps(data: dict[str, Any] | None) -> dict[str, int]:
    out: dict[str, int] = {}
    for part in PARTS:
        value = (data or {}).get(f"u_{part}")
        if isinstance(value, int) and not isinstance(value, bool):
            out[part] = value
    return out
