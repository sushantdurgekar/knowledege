"""Postgres store (build-contracts.md section 23, architecture-spec.md section 4.8).

`STORE=postgres` + `DATABASE_URL`; a `psycopg_pool.ConnectionPool` of at most
`PG_POOL_MAX` connections (autocommit; multi-statement work runs in explicit
transactions). The schema lives in `sql/NNNN_*.sql` and is applied on first use under
`pg_advisory_lock(842001)`, each file once, recorded in `schema_migrations`; the pool and
the migrations start lazily, so a server whose database is down still serves the hubs.

Semantics are the memory and Firestore stores': one row per stored part
(`progress(uid, hub_id, part)`), the hub document being all rows of `(uid, hub_id)`
(`doc_id` = `{uid}~{hub}`, the cursor of every scan). `put_parts` is one transaction:
a per-hub advisory lock (so two first writes of a hub never both report `accepted`),
`SELECT ... FOR UPDATE` of the hub's stamps, `decide`, then upserts guarded by
`WHERE progress.upd < EXCLUDED.upd`; the tombstone is read only when the hub has no
rows. `done` is a hub value, kept equal on every row of the hub.

Operations are counted the way Firestore bills them (as `MemoryStore` does), so the
meter, the admin stats and the contract suite read the same numbers on every store;
with `STORE=postgres` the quota is not enforced (`QUOTA_ENFORCE=0` by default).
"""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import psycopg
import psycopg.sql
from psycopg import errors as pg_errors
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool, PoolTimeout

from app.progress.decide import decide
from app.store.base import (
    COUNT_KINDS,
    PARTS,
    AccountDeleted,
    BatchResult,
    Conflict,
    HubSummary,
    JobLost,
    OpCounter,
    PartIn,
    PartInfo,
    PartOut,
    PartResult,
    RestoreItem,
    StoreError,
    Tombstone,
    TooLarge,
    Unavailable,
    UserRecord,
    check_batch,
    check_setting_version,
    empty_counts,
    merged_done,
    newest_parts,
    tombstone_hash,
    with_counts,
)

logger = logging.getLogger(__name__)

SQL_DIR = Path(__file__).resolve().parent / "sql"
MIGRATION_LOCK = 842001
HUB_LOCK = 842002  # pg_advisory_xact_lock(HUB_LOCK, hashtext(doc id)): one writer per hub
LOGIN_TOUCH_INTERVAL = timedelta(hours=24)
PART_OVERHEAD = 24  # approximate bytes of a stored part beyond its payload (egress estimate)
STATEMENT_TIMEOUT_MS = 60_000
USER_COLUMNS = "uid, email, email_verified, name, photo, provider, created_at, last_login_at"


def migrations() -> list[tuple[int, str]]:
    """(version, SQL) of every `sql/NNNN_name.sql`, in order."""
    out = []
    for path in sorted(SQL_DIR.glob("[0-9][0-9][0-9][0-9]_*.sql")):
        out.append((int(path.name[:4]), path.read_text(encoding="utf-8")))
    return out


def _now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _stamps_size(n_parts: int) -> int:
    return 0 if n_parts == 0 else 16 * n_parts + 32


class PostgresStore:
    kind = "postgres"

    def __init__(
        self,
        url: str,
        *,
        pool_max: int = 5,
        allow_reset: bool = False,
        connect_timeout: int = 10,
        schema: str | None = None,
    ) -> None:
        self.ops = OpCounter()
        self._allow_reset = allow_reset
        if schema is not None and not schema.replace("_", "").isalnum():
            raise ValueError("schema must be letters, digits and underscores")
        self._schema = schema
        self._pool = ConnectionPool(
            url,
            min_size=1,
            max_size=pool_max,
            open=False,
            timeout=10.0,
            name="studyhubs",
            check=ConnectionPool.check_connection,
            kwargs={
                "autocommit": True,
                "connect_timeout": connect_timeout,
                "options": f"-c TimeZone=UTC -c statement_timeout={STATEMENT_TIMEOUT_MS}"
                + (f" -c search_path={schema}" if schema else ""),
            },
        )
        self._init_lock = threading.Lock()
        self._opened = False
        self._ready = False
        self._closed = False
        self._faults: list[list[Any]] = []  # [op, exc, remaining] (tests: a crash mid-batch)
        self._fault_lock = threading.Lock()

    # -- pool, migrations, errors ---------------------------------------------------------

    def _ensure(self) -> None:
        if self._ready:
            return
        with self._init_lock:
            if self._ready:
                return
            if self._closed:
                raise Unavailable("the Postgres store is closed")
            if not self._opened:
                self._pool.open(wait=False)
                self._opened = True
            with self._pool.connection() as conn:
                if self._schema:
                    conn.execute(
                        psycopg.sql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(
                            psycopg.sql.Identifier(self._schema)
                        )
                    )
                self._migrate(conn)
            self._ready = True

    @staticmethod
    def _migrate(conn: psycopg.Connection[Any]) -> None:
        conn.execute("SELECT pg_advisory_lock(%s)", (MIGRATION_LOCK,))
        try:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS schema_migrations "
                "(version int PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
            )
            applied = {row[0] for row in conn.execute("SELECT version FROM schema_migrations")}
            for version, sql in migrations():
                if version in applied:
                    continue
                with conn.transaction():
                    conn.execute(sql.encode("utf-8"))
                    conn.execute("INSERT INTO schema_migrations (version) VALUES (%s)", (version,))
                logger.info("Postgres: applied migration %04d", version)
        finally:
            conn.execute("SELECT pg_advisory_unlock(%s)", (MIGRATION_LOCK,))

    @contextmanager
    def _conn(self, kind: str = "reads") -> Iterator[psycopg.Connection[Any]]:
        try:
            self._ensure()
            with self._pool.connection() as conn:
                yield conn
        except StoreError:
            raise
        except Exception as exc:
            raise self._translate(exc, kind) from exc

    @staticmethod
    def _translate(exc: BaseException, kind: str) -> StoreError:
        if isinstance(exc, pg_errors.CheckViolation) and "data" in str(exc):
            return TooLarge(str(exc))
        if isinstance(
            exc,
            pg_errors.SerializationFailure | pg_errors.DeadlockDetected | pg_errors.LockNotAvailable,
        ):
            return Unavailable(f"contention: {exc}")
        if isinstance(exc, psycopg.OperationalError | psycopg.InterfaceError | PoolTimeout):
            logger.warning("Postgres unavailable (%s): %s", kind, exc)
            return Unavailable(str(exc))
        logger.error("Postgres error (%s): %r", kind, exc)
        return Unavailable(f"Postgres error: {type(exc).__name__}")

    def close(self) -> None:
        self._closed = True
        if self._opened:
            try:
                self._pool.close()
            except Exception:
                logger.debug("Postgres pool close failed", exc_info=True)

    def fail_next(self, op: str, exc: BaseException, count: int = 1) -> None:
        """Test hook: raise `exc` at the named point (`restore_batch`: before the checkpoint)."""
        with self._fault_lock:
            self._faults.append([op, exc, count])

    def _fault(self, op: str) -> None:
        with self._fault_lock:
            for fault in self._faults:
                if fault[0] == op and fault[2] > 0:
                    fault[2] -= 1
                    self._faults = [f for f in self._faults if f[2] > 0]
                    raise fault[1]

    # -- health and users ------------------------------------------------------------------

    def ping(self) -> None:
        with self._conn() as conn:
            conn.execute("SELECT 1")
        self.ops.add(reads=1)

    def upsert_user(self, u: UserRecord, *, touch_login: bool) -> None:
        now = u.last_login_at or datetime.now(UTC)
        wrote = False
        with self._conn("writes") as conn, conn.transaction():
            row = conn.execute(
                f"SELECT {USER_COLUMNS} FROM users WHERE uid = %s FOR UPDATE", (u.uid,)
            ).fetchone()
            if row is None:
                inserted = conn.execute(
                    f"INSERT INTO users ({USER_COLUMNS}) VALUES (%s, %s, %s, %s, %s, %s, %s, %s) "
                    "ON CONFLICT (uid) DO NOTHING RETURNING uid",
                    (
                        u.uid,
                        u.email,
                        bool(u.email_verified),
                        u.name,
                        u.photo,
                        u.provider,
                        now,
                        now if touch_login else None,
                    ),
                ).fetchone()
                wrote = inserted is not None
            else:
                current = _user(row)
                last = current.last_login_at
                login = now if touch_login and (last is None or now - last >= LOGIN_TOUCH_INTERVAL) else last
                wanted = (u.email, bool(u.email_verified), u.name, u.photo, u.provider, login)
                have = (
                    current.email,
                    current.email_verified,
                    current.name,
                    current.photo,
                    current.provider,
                    last,
                )
                if wanted != have:
                    conn.execute(
                        "UPDATE users SET email = %s, email_verified = %s, name = %s, photo = %s, "
                        "provider = %s, last_login_at = %s WHERE uid = %s",
                        (*wanted, u.uid),
                    )
                    wrote = True
        self.ops.add(reads=1, writes=1 if wrote else 0)

    def get_user(self, uid: str) -> UserRecord | None:
        with self._conn() as conn:
            row = conn.execute(f"SELECT {USER_COLUMNS} FROM users WHERE uid = %s", (uid,)).fetchone()
        self.ops.add(reads=1, fs_egress=128 if row else 0)
        return _user(row) if row else None

    def count_users(self) -> int:
        with self._conn() as conn:
            n = int(conn.execute("SELECT count(*) FROM users").fetchone()[0])  # type: ignore[index]
        self.ops.add(reads=max(1, -(-n // 1000)))
        return n

    # -- progress -----------------------------------------------------------------------------

    def get_hub(self, uid: str, hub: str, known: dict[str, int]) -> dict[str, PartOut]:
        single = not any(v > 0 for v in known.values())
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT part, upd, CASE WHEN upd > COALESCE((%s::jsonb ->> part)::bigint, 0) "
                "THEN data END FROM progress WHERE uid = %s AND hub_id = %s",
                (Jsonb({k: int(v) for k, v in known.items()}), uid, hub),
            ).fetchall()
        if not rows:
            self.ops.add(reads=1)
            return {}
        out: dict[str, PartOut] = {}
        newer = 0
        for part, upd, data in sorted(rows, key=lambda r: PARTS.index(r[0])):
            blob = bytes(data) if data is not None else None
            out[part] = PartOut(int(upd), blob)
            if blob is not None:
                newer += len(blob) + PART_OVERHEAD
        stamps = _stamps_size(len(rows))
        if single:
            self.ops.add(reads=1, fs_egress=stamps + newer)
        else:
            self.ops.add(reads=1, fs_egress=stamps)
            if newer:
                self.ops.add(reads=1, fs_egress=stamps + newer)
        return out

    def _apply_parts(
        self,
        conn: psycopg.Connection[Any],
        uid: str,
        hub: str,
        parts: dict[str, PartIn],
        *,
        check_tombstone: bool,
    ) -> tuple[dict[str, PartResult], int, bool]:
        """Newest-wins for one hub inside the caller's transaction.

        Returns (results, reads, wrote). Raises AccountDeleted (tombstone on a first write).
        """
        conn.execute("SELECT pg_advisory_xact_lock(%s, hashtext(%s))", (HUB_LOCK, f"{uid}~{hub}"))
        rows = conn.execute(
            "SELECT part, upd, done FROM progress WHERE uid = %s AND hub_id = %s FOR UPDATE", (uid, hub)
        ).fetchall()
        reads = 1
        if not rows and check_tombstone:
            reads += 1
            tomb = conn.execute("SELECT 1 FROM tombstones WHERE h = %s", (tombstone_hash(uid),)).fetchone()
            if tomb is not None:
                self.ops.add(reads=reads)
                raise AccountDeleted("the account was deleted")
        stored = {part: int(upd) for part, upd, _ in rows}
        hub_done = next((d for _, _, d in rows if d is not None), None)
        results: dict[str, PartResult] = {}
        accepted: set[str] = set()
        for part, incoming in parts.items():
            status = decide(stored.get(part), incoming.upd)
            if status == "accepted":
                accepted.add(part)
                results[part] = PartResult(status, incoming.upd)
            else:
                results[part] = PartResult(status, stored[part])
        if not accepted:
            return results, reads, False
        done = merged_done(parts, accepted)
        row_done = done if done is not None else hub_done
        for part in sorted(accepted, key=PARTS.index):
            p = parts[part]
            conn.execute(
                "INSERT INTO progress (uid, hub_id, part, upd, data, raw_len, done, updated_at) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, now()) "
                "ON CONFLICT (uid, hub_id, part) DO UPDATE SET upd = EXCLUDED.upd, data = EXCLUDED.data, "
                "raw_len = EXCLUDED.raw_len, updated_at = EXCLUDED.updated_at "
                "WHERE progress.upd < EXCLUDED.upd",
                (uid, hub, part, p.upd, p.gz, p.raw_len, row_done),
            )
        if done is not None and done != hub_done:
            conn.execute("UPDATE progress SET done = %s WHERE uid = %s AND hub_id = %s", (done, uid, hub))
        return results, reads, True

    def put_parts(self, uid: str, hub: str, parts: dict[str, PartIn], now_ms: int) -> dict[str, PartResult]:
        with self._conn("writes") as conn, conn.transaction():
            results, reads, wrote = self._apply_parts(conn, uid, hub, parts, check_tombstone=True)
        self.ops.add(reads=reads, writes=1 if wrote else 0)
        return results

    # -- usage and settings ---------------------------------------------------------------------

    def add_usage(self, day: str, deltas: dict[str, int]) -> None:
        counters = {name: int(value) for name, value in deltas.items()}
        with self._conn("writes") as conn:
            conn.execute(
                "INSERT INTO usage AS u (key, counters) VALUES (%s, %s) "
                "ON CONFLICT (key) DO UPDATE SET counters = ("
                " SELECT jsonb_object_agg(k, COALESCE((u.counters ->> k)::bigint, 0)"
                "   + COALESCE((EXCLUDED.counters ->> k)::bigint, 0))"
                " FROM (SELECT jsonb_object_keys(u.counters) UNION"
                "       SELECT jsonb_object_keys(EXCLUDED.counters)) AS names(k))",
                (day, Jsonb(counters)),
            )
        self.ops.add(writes=1)

    def get_usage(self, keys: list[str]) -> dict[str, dict[str, int]]:
        if not keys:
            return {}
        with self._conn() as conn:
            rows = conn.execute("SELECT key, counters FROM usage WHERE key = ANY(%s)", (keys,)).fetchall()
        self.ops.add(reads=len(keys))
        return {key: {k: int(v) for k, v in counters.items()} for key, counters in rows}

    def get_setting(self, key: str) -> tuple[dict[str, Any], int] | None:
        with self._conn() as conn:
            row = conn.execute("SELECT value, version FROM settings WHERE key = %s", (key,)).fetchone()
        self.ops.add(reads=1, fs_egress=256 if row else 0)
        return (dict(row[0]), int(row[1])) if row else None

    def put_setting(self, key: str, value: dict[str, Any], *, expect_version: int | None) -> int:
        with self._conn("writes") as conn, conn.transaction():
            row = conn.execute("SELECT version FROM settings WHERE key = %s FOR UPDATE", (key,)).fetchone()
            self.ops.add(reads=1)
            current = int(row[0]) if row else None
            version = check_setting_version(current, expect_version)  # raises Conflict
            if current is None:
                inserted = conn.execute(
                    "INSERT INTO settings (key, value, version) VALUES (%s, %s, %s) "
                    "ON CONFLICT (key) DO NOTHING RETURNING key",
                    (key, Jsonb(value), version),
                ).fetchone()
                if inserted is None:  # created by someone else since our read
                    raise Conflict(f"setting {key!r} was created concurrently")
            else:
                conn.execute(
                    "UPDATE settings SET value = %s, version = %s, updated_at = now() WHERE key = %s",
                    (Jsonb(value), version, key),
                )
        self.ops.add(writes=1)
        return version

    # -- M2: account ---------------------------------------------------------------------------

    def list_hubs(self, uid: str, *, payloads: bool = False) -> list[HubSummary]:
        data = "data" if payloads else "NULL::bytea"
        with self._conn() as conn:
            rows = conn.execute(
                f"SELECT hub_id, part, upd, raw_len, done, {data} FROM progress WHERE uid = %s "
                "ORDER BY doc_id",
                (uid,),
            ).fetchall()
        hubs: dict[str, dict[str, Any]] = {}
        egress = 0
        for hub, part, upd, raw_len, done, blob in rows:
            entry = hubs.setdefault(hub, {"parts": {}, "done": None})
            gz = bytes(blob) if blob is not None else None
            entry["parts"][part] = PartInfo(int(upd), int(raw_len), gz)
            if done is not None:
                entry["done"] = int(done)
            egress += 24 + (len(gz) if gz else 0)
        out = [
            HubSummary(hub, {p: e["parts"][p] for p in PARTS if p in e["parts"]}, e["done"])
            for hub, e in hubs.items()
        ]
        self.ops.add(reads=max(1, len(out)), fs_egress=egress)
        return out

    def delete_user(self, uid: str) -> int:
        with self._conn("deletes") as conn, conn.transaction():
            row = conn.execute(
                "SELECT count(DISTINCT hub_id) FROM progress WHERE uid = %s", (uid,)
            ).fetchone()
            n = int(row[0]) if row else 0
            conn.execute("DELETE FROM progress WHERE uid = %s", (uid,))
            conn.execute("DELETE FROM users WHERE uid = %s", (uid,))
        self.ops.add(reads=max(1, n), deletes=n + 1)
        return n

    def put_tombstone(self, h: str, at: datetime) -> None:
        with self._conn("writes") as conn:
            conn.execute("INSERT INTO tombstones (h, at) VALUES (%s, %s) ON CONFLICT (h) DO NOTHING", (h, at))
        self.ops.add(writes=1)

    def is_tombstoned(self, uid_hashes: list[str]) -> set[str]:
        if not uid_hashes:
            return set()
        with self._conn() as conn:
            rows = conn.execute("SELECT h FROM tombstones WHERE h = ANY(%s)", (list(uid_hashes),)).fetchall()
        self.ops.add(reads=len(uid_hashes))
        return {row[0] for row in rows}

    def count_docs(self, kind: str) -> int:
        if kind not in COUNT_KINDS:
            raise ValueError(f"unknown collection {kind!r}")
        if kind == "users":
            return self.count_users()
        query = (
            "SELECT count(DISTINCT doc_id) FROM progress"
            if kind == "progress"
            else "SELECT count(*) FROM tombstones"
        )
        with self._conn() as conn:
            n = int(conn.execute(query).fetchone()[0])  # type: ignore[index]
        self.ops.add(reads=max(1, -(-n // 1000)))
        return n

    # -- M2: scans by document id -----------------------------------------------------------------

    def _pages(self, query: str, page: int) -> Iterator[list[tuple[Any, ...]]]:
        """Keyset pages: `query` takes (cursor, limit) and returns rows whose first column is the id."""
        if page < 1:
            raise ValueError("page must be positive")
        cursor = ""
        while True:
            with self._conn() as conn:
                rows = conn.execute(query, (cursor, page)).fetchall()
            self.ops.add(reads=max(1, len(rows)))
            if rows:
                yield rows
            if len(rows) < page:
                return
            cursor = rows[-1][0]

    def iter_users(self, page: int = 300) -> Iterator[UserRecord]:
        query = f"SELECT {USER_COLUMNS} FROM users WHERE uid > %s ORDER BY uid LIMIT %s"
        for rows in self._pages(query, page):
            self.ops.add(fs_egress=128 * len(rows))
            for row in rows:
                yield _user(row)

    def _doc_page(self, conn: psycopg.Connection[Any], cursor: str, page: int, columns: str) -> list[Any]:
        return conn.execute(
            f"SELECT doc_id, uid, hub_id, part, {columns} FROM progress WHERE doc_id IN ("
            " SELECT DISTINCT doc_id FROM progress WHERE doc_id > %s ORDER BY doc_id LIMIT %s)"
            " ORDER BY doc_id",
            (cursor, page),
        ).fetchall()

    def _doc_pages(self, page: int, columns: str) -> Iterator[list[tuple[str, str, str, list[Any]]]]:
        """Pages of hub documents (doc_id, uid, hub, [(part, *columns)]) by document id."""
        if page < 1:
            raise ValueError("page must be positive")
        cursor = ""
        while True:
            with self._conn() as conn:
                rows = self._doc_page(conn, cursor, page, columns)
            docs: list[tuple[str, str, str, list[Any]]] = []
            for doc_id, uid, hub, *rest in rows:
                if not docs or docs[-1][0] != doc_id:
                    docs.append((doc_id, uid, hub, []))
                docs[-1][3].append(tuple(rest))
            self.ops.add(reads=max(1, len(docs)))
            if docs:
                yield docs
            if len(docs) < page:
                return
            cursor = docs[-1][0]

    def iter_progress(self, page: int = 300) -> Iterator[tuple[str, str, dict[str, PartOut]]]:
        for docs in self._doc_pages(page, "upd, data"):
            batch = []
            egress = 0
            for _, uid, hub, rows in docs:
                parts = {part: PartOut(int(upd), bytes(data)) for part, upd, data in rows}
                egress += sum(len(p.gz or b"") for p in parts.values())
                batch.append((uid, hub, {p: parts[p] for p in PARTS if p in parts}))
            self.ops.add(fs_egress=egress + _stamps_size(4) * len(docs))
            yield from batch

    def iter_tombstones(self, page: int = 300) -> Iterator[Tombstone]:
        query = "SELECT h, at FROM tombstones WHERE h > %s ORDER BY h LIMIT %s"
        for rows in self._pages(query, page):
            for h, at in rows:
                yield Tombstone(h, at)

    def storage_scan(self, page: int = 300) -> tuple[int, int]:
        docs = total = 0
        for chunk in self._doc_pages(page, "raw_len"):
            for _, _, _, rows in chunk:
                docs += 1
                total += sum(int(r[1]) for r in rows)
        return docs, total

    # -- M2: jobs ------------------------------------------------------------------------------------

    def get_job(self, id: str) -> dict[str, Any] | None:
        with self._conn() as conn:
            row = conn.execute("SELECT doc FROM jobs WHERE id = %s", (id,)).fetchone()
        self.ops.add(reads=1, fs_egress=512 if row else 0)
        return {**row[0], "id": id} if row else None

    def put_job(self, job: dict[str, Any]) -> None:
        doc = dict(job)
        created = doc.get("createdAt") if isinstance(doc.get("createdAt"), str) else None
        with self._conn("writes") as conn:
            conn.execute(
                "INSERT INTO jobs (id, kind, state, holder, created_at, doc, updated_at) "
                "VALUES (%s, %s, %s, %s, %s, %s, now()) ON CONFLICT (id) DO UPDATE SET "
                "kind = EXCLUDED.kind, state = EXCLUDED.state, holder = EXCLUDED.holder, "
                "created_at = EXCLUDED.created_at, doc = EXCLUDED.doc, updated_at = now()",
                (
                    str(doc["id"]),
                    str(doc.get("kind") or ""),
                    str(doc.get("state") or ""),
                    doc.get("holder"),
                    created,
                    Jsonb(doc),
                ),
            )
        self.ops.add(writes=1)

    def claim_job(self, id: str, holder: str, from_states: set[str], *, to_state: str = "running") -> bool:
        now = _now_iso()
        fields: dict[str, Any] = {"state": to_state, "holder": holder, "updatedAt": now}
        if to_state == "running":
            fields["claimedAt"] = now
        with self._conn("writes") as conn:
            row = conn.execute(
                "UPDATE jobs SET state = %s, holder = %s, doc = doc || %s, updated_at = now() "
                "WHERE id = %s AND state = ANY(%s) RETURNING id",
                (to_state, holder, Jsonb(fields), id, sorted(from_states)),
            ).fetchone()
        self.ops.add(reads=1, writes=1 if row else 0)
        return row is not None

    def update_job(self, id: str, fields: dict[str, Any], *, expect: dict[str, Any]) -> bool:
        with self._conn("writes") as conn, conn.transaction():
            row = conn.execute("SELECT doc FROM jobs WHERE id = %s FOR UPDATE", (id,)).fetchone()
            self.ops.add(reads=1)
            if row is None or any(row[0].get(k) != v for k, v in expect.items()):
                return False
            self._write_job_doc(conn, id, {**row[0], **fields})
        self.ops.add(writes=1)
        return True

    @staticmethod
    def _write_job_doc(conn: psycopg.Connection[Any], id: str, doc: dict[str, Any]) -> None:
        doc.pop("id", None)
        conn.execute(
            "UPDATE jobs SET state = %s, holder = %s, doc = %s, updated_at = now() WHERE id = %s",
            (str(doc.get("state") or ""), doc.get("holder"), Jsonb({**doc, "id": id}), id),
        )

    def list_jobs(self, states: set[str] | None = None, limit: int = 50) -> list[dict[str, Any]]:
        with self._conn() as conn:
            if states:
                rows = conn.execute(
                    "SELECT id, doc FROM jobs WHERE state = ANY(%s) ORDER BY id LIMIT %s",
                    (sorted(states), limit),
                ).fetchall()
            else:  # newest first by createdAt, like the Firestore query (jobs without it are skipped)
                rows = conn.execute(
                    "SELECT id, doc FROM jobs WHERE created_at IS NOT NULL "
                    "ORDER BY created_at DESC, id DESC LIMIT %s",
                    (limit,),
                ).fetchall()
        self.ops.add(reads=max(1, len(rows)), fs_egress=512 * len(rows))
        return [{**doc, "id": id} for id, doc in rows]

    # -- M3: restore -------------------------------------------------------------------------------

    def restore_lookup(
        self, uids: list[str], docs: list[tuple[str, str]]
    ) -> tuple[set[str], dict[tuple[str, str], dict[str, int]]]:
        """Which uids have a user row, and the stored stamps of each hub document."""
        existing: set[str] = set()
        stamps: dict[tuple[str, str], dict[str, int]] = {}
        with self._conn() as conn:
            if uids:
                rows = conn.execute("SELECT uid FROM users WHERE uid = ANY(%s)", (list(uids),)).fetchall()
                existing = {row[0] for row in rows}
            if docs:
                ids = [f"{uid}~{hub}" for uid, hub in docs]
                rows = conn.execute(
                    "SELECT uid, hub_id, part, upd FROM progress WHERE doc_id = ANY(%s)", (ids,)
                ).fetchall()
                for uid, hub, part, upd in rows:
                    stamps.setdefault((uid, hub), {})[part] = int(upd)
        self.ops.add(reads=len(uids) + len(docs))
        return existing, stamps

    def _lock_job(self, conn: psycopg.Connection[Any], job_id: str) -> dict[str, Any] | None:
        row = conn.execute("SELECT doc FROM jobs WHERE id = %s FOR UPDATE", (job_id,)).fetchone()
        return dict(row[0]) if row else None

    def restore_batch(
        self,
        recs: list[RestoreItem],
        *,
        mode: str,
        job_id: str,
        checkpoint: dict[str, Any],
        holder: str,
    ) -> BatchResult:
        """One transaction: the batch's records and the job's checkpoint (exactly once)."""
        if mode not in ("merge", "replace"):
            raise ValueError(f"unknown restore mode {mode!r}")
        written, kept = empty_counts(), empty_counts()
        reads = writes = 0
        with self._conn("writes") as conn, conn.transaction():
            stored = self._lock_job(conn, job_id)
            reads += 1
            if not check_batch(stored, checkpoint, holder):
                return BatchResult(False, deepcopy((stored or {}).get("checkpoint") or {}))
            for item in recs:
                if item.t == "tombstone" and item.tombstone is not None:
                    row = conn.execute(
                        "INSERT INTO tombstones (h, at) VALUES (%s, %s) "
                        "ON CONFLICT (h) DO NOTHING RETURNING h",
                        (item.tombstone.h, item.tombstone.at),
                    ).fetchone()
                    (written if row else kept)["tombstone"] += 1
            users = [item.user for item in recs if item.t == "user" and item.user is not None]
            if mode == "replace":
                with conn.cursor().copy(f"COPY users_import (job_id, {USER_COLUMNS}) FROM STDIN") as copy:
                    for u in users:
                        copy.write_row((job_id, *_user_row(u)))
                written["user"] += len(users)
                progress = [i for i in recs if i.t == "progress" and i.data is not None]
                with conn.cursor().copy(
                    "COPY progress_import (job_id, uid, hub_id, part, upd, data, raw_len, done) FROM STDIN"
                ) as copy:
                    for i in progress:
                        p = i.data
                        assert p is not None  # noqa: S101 - filtered above
                        copy.write_row((job_id, i.uid, i.hub, i.part, p.upd, p.gz, p.raw_len, p.done))
                written["progress"] += len(progress)
                writes += len(users) + len(progress)
            else:
                for u in users:
                    row = conn.execute(
                        f"INSERT INTO users ({USER_COLUMNS}) VALUES (%s, %s, %s, %s, %s, %s, %s, %s) "
                        "ON CONFLICT (uid) DO NOTHING RETURNING uid",
                        _user_row(u),
                    ).fetchone()
                    (written if row else kept)["user"] += 1
                groups, dropped = newest_parts(recs)
                kept["progress"] += dropped
                for (uid, hub), parts in groups.items():
                    results, n, wrote = self._apply_parts(conn, uid, hub, parts, check_tombstone=False)
                    reads += n
                    writes += 1 if wrote else 0
                    for result in results.values():
                        (written if result.status == "accepted" else kept)["progress"] += 1
            writes += written["user"] if mode == "merge" else 0
            writes += written["tombstone"]
            self._fault("restore_batch")  # tests: a crash here rolls the whole batch back
            final = with_counts(checkpoint, written, kept)
            conn.execute(
                "UPDATE jobs SET doc = jsonb_set(doc, '{checkpoint}', %s), updated_at = now() WHERE id = %s",
                (Jsonb(final), job_id),
            )
        self.ops.add(reads=reads, writes=writes + 1)
        return BatchResult(True, final, written, kept)

    def swap_replace(
        self, job_id: str, *, holder: str, expected: dict[str, int], checkpoint: dict[str, Any]
    ) -> BatchResult:
        """Replace users and progress with the staged rows, in one transaction."""
        with self._conn("writes") as conn, conn.transaction():
            stored = self._lock_job(conn, job_id)
            if stored is None or stored.get("state") != "running" or stored.get("holder") != holder:
                raise JobLost("the restore job is no longer held by this runner")
            if (stored.get("checkpoint") or {}).get("phase") in ("swapped", "verified"):
                return BatchResult(False, deepcopy(stored["checkpoint"]))
            conn.execute("SET LOCAL statement_timeout = 0")
            row = conn.execute(
                "SELECT (SELECT count(*) FROM users_import WHERE job_id = %s),"
                " (SELECT count(*) FROM progress_import WHERE job_id = %s)",
                (job_id, job_id),
            ).fetchone()
            staged = {"user": int(row[0]), "progress": int(row[1])} if row else {}
            want = {"user": int(expected.get("user", 0)), "progress": int(expected.get("progress", 0))}
            if staged != want:
                raise Conflict(f"staged rows {staged} do not match the expected {want}")
            conn.execute("TRUNCATE progress, users CASCADE")
            conn.execute(
                f"INSERT INTO users ({USER_COLUMNS}) SELECT DISTINCT ON (uid) {USER_COLUMNS} "
                "FROM users_import WHERE job_id = %s ORDER BY uid, last_login_at DESC NULLS LAST",
                (job_id,),
            )
            conn.execute(
                "INSERT INTO progress (uid, hub_id, part, upd, data, raw_len, done) "
                "SELECT uid, hub_id, part, upd, data, raw_len, max(done) OVER (PARTITION BY uid, hub_id) "
                "FROM (SELECT DISTINCT ON (uid, hub_id, part) uid, hub_id, part, upd, data, raw_len, done "
                "      FROM progress_import WHERE job_id = %s ORDER BY uid, hub_id, part, upd DESC) AS s",
                (job_id,),
            )
            conn.execute("DELETE FROM users_import WHERE job_id = %s", (job_id,))
            conn.execute("DELETE FROM progress_import WHERE job_id = %s", (job_id,))
            final = deepcopy(checkpoint)
            conn.execute(
                "UPDATE jobs SET doc = jsonb_set(doc, '{checkpoint}', %s), updated_at = now() WHERE id = %s",
                (Jsonb(final), job_id),
            )
        self.ops.add(reads=1, writes=staged["user"] + staged["progress"] + 1)
        return BatchResult(True, final)

    def wipe_for_replace(self, job_id: str) -> None:
        """Drop a job's staged rows (a cancelled or failed replace, or a fresh start)."""
        with self._conn("deletes") as conn, conn.transaction():
            conn.execute("DELETE FROM users_import WHERE job_id = %s", (job_id,))
            conn.execute("DELETE FROM progress_import WHERE job_id = %s", (job_id,))

    # -- test support -----------------------------------------------------------------------------

    def reset(self) -> None:
        """Empty every table (`POST /api/test/reset`). Refused unless created for tests."""
        if not self._allow_reset:
            raise StoreError("reset is only available on a test database")
        with self._conn("deletes") as conn:
            conn.execute(
                "TRUNCATE users, progress, tombstones, settings, jobs, usage, users_import, progress_import"
            )
        self.ops.reset()

    def dump(self, decode: Callable[[bytes], Any]) -> dict[str, Any]:
        """Users, decoded progress, usage and tombstones, like `MemoryStore.dump`. Not billed."""
        with self._conn() as conn:
            users = [_user(row) for row in conn.execute(f"SELECT {USER_COLUMNS} FROM users ORDER BY uid")]
            rows = conn.execute(
                "SELECT uid, hub_id, part, upd, data, raw_len, done FROM progress ORDER BY uid, hub_id"
            ).fetchall()
            usage = dict(conn.execute("SELECT key, counters FROM usage ORDER BY key").fetchall())
            stones = conn.execute("SELECT h, at FROM tombstones ORDER BY h").fetchall()
        progress = [
            {
                "uid": uid,
                "hub": hub,
                "part": part,
                "upd": int(upd),
                "data": decode(bytes(data)),
                "rawLen": int(raw_len),
                "done": done,
            }
            for uid, hub, part, upd, data, raw_len, done in sorted(
                rows, key=lambda r: (r[0], r[1], PARTS.index(r[2]))
            )
        ]
        return {
            "users": [
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
                for u in users
            ],
            "progress": progress,
            "usage": {k: {n: int(v) for n, v in c.items()} for k, c in usage.items()},
            "tombstones": [{"h": h, "at": _iso(at)} for h, at in stones],
        }

    def wait_ready(self, timeout_s: float = 10.0) -> None:
        """Block until the pool connects and the schema is current (tests, the CLI)."""
        deadline = time.monotonic() + timeout_s
        while True:
            try:
                self._ensure()
                return
            except Exception:
                if time.monotonic() >= deadline:
                    raise
                time.sleep(0.2)


def _user(row: tuple[Any, ...]) -> UserRecord:
    uid, email, verified, name, photo, provider, created_at, last_login_at = row
    return UserRecord(
        uid=uid,
        email=email,
        email_verified=bool(verified),
        name=name,
        photo=photo,
        provider=provider,
        created_at=created_at,
        last_login_at=last_login_at,
    )


def _user_row(u: UserRecord) -> tuple[Any, ...]:
    return (
        u.uid,
        u.email,
        bool(u.email_verified),
        u.name,
        u.photo,
        u.provider,
        u.created_at,
        u.last_login_at,
    )


def _iso(moment: datetime | None) -> str | None:
    return moment.astimezone(UTC).isoformat().replace("+00:00", "Z") if moment else None
