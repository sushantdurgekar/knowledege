"""Backups from the admin page (build-contracts.md section 19).

    GET  /api/admin/backups/estimate  {users, docs, tombstones, estReads, readsLeftToday, fits}
    POST /api/admin/backups           {passphrase?, requireReadOnly, confirm:"BACKUP"}
                                      -> {ticket, filename, expiresIn:120}
    GET  /api/admin/backups/{ticket}  single use, same admin: the streamed .backup
    GET  /api/admin/backups/log       the last 20 runs, kept in meta/backups

The passphrase lives only in the ticket (process memory, at most 120 s) and in the
writer while it streams; it is never stored or logged. With `requireReadOnly` the run
enters `read_only` maintenance and restores the previous mode afterwards, so the
header can say `consistent: true`. One backup runs at a time.
"""

from __future__ import annotations

import logging
import secrets
import threading
from collections.abc import Iterator
from dataclasses import dataclass, replace
from datetime import datetime
from typing import Any

from app import __version__
from app.admin.site import Maintenance, SiteSettings
from app.backup.writer import BackupSource, BackupWriter
from app.quota.pacific import iso_utc
from app.store.base import Conflict, StoreError

logger = logging.getLogger(__name__)

TICKET_TTL_S = 120
BACKUPS_KEY = "backups"
LOG_KEEP = 20
READ_RESERVE = 0.2
BACKUP_MESSAGE = (
    "A backup is running: sync is paused for a few minutes. Your progress is saved in this browser."
)


@dataclass(frozen=True)
class Estimate:
    users: int
    docs: int
    tombstones: int
    reads_left: int

    @property
    def est_reads(self) -> int:
        # One read per document of each scan, plus one empty page each and the settings read.
        return self.users + self.docs + self.tombstones + 4

    @property
    def fits(self) -> bool:
        return self.est_reads <= self.reads_left * (1 - READ_RESERVE)

    def to_json(self) -> dict[str, Any]:
        return {
            "users": self.users,
            "docs": self.docs,
            "tombstones": self.tombstones,
            "estReads": self.est_reads,
            "readsLeftToday": self.reads_left,
            "fits": self.fits,
        }


@dataclass(frozen=True)
class Ticket:
    id: str
    uid: str
    expires_at: float
    passphrase: str | None
    require_read_only: bool
    estimate: Estimate
    filename: str


def estimate(runtime: Any) -> Estimate:
    """Three count() aggregations (1 read per 1,000 entries each)."""
    store = runtime.store
    users = store.count_docs("users")
    docs = store.count_docs("progress")
    tombstones = store.count_docs("tombstones")
    left = max(0, runtime.settings.quota_reads - runtime.meter.today()["reads"])
    return Estimate(users, docs, tombstones, left)


class Backups:
    def __init__(self, clock: Any) -> None:
        self._clock = clock
        self._lock = threading.Lock()
        self._tickets: dict[str, Ticket] = {}
        self.running = False

    def create(self, uid: str, *, passphrase: str | None, require_read_only: bool, est: Estimate) -> Ticket:
        now = self._clock.now()
        filename = f"studyhubs-{now.strftime('%Y%m%d-%H%M%S')}Z.backup"
        ticket = Ticket(
            id=secrets.token_urlsafe(32),
            uid=uid,
            expires_at=self._clock.now_s() + TICKET_TTL_S,
            passphrase=passphrase,
            require_read_only=require_read_only,
            estimate=est,
            filename=filename,
        )
        with self._lock:
            now_s = self._clock.now_s()
            self._tickets = {k: t for k, t in self._tickets.items() if t.expires_at > now_s}
            self._tickets[ticket.id] = ticket
        return ticket

    def take(self, ticket_id: str, uid: str) -> Ticket | None:
        """The ticket, once: unknown, expired or another admin's ticket gives None."""
        with self._lock:
            ticket = self._tickets.pop(ticket_id, None)
        if ticket is None or ticket.uid != uid or ticket.expires_at <= self._clock.now_s():
            return None
        return ticket

    def start(self) -> bool:
        with self._lock:
            if self.running:
                return False
            self.running = True
            return True

    def done(self) -> None:
        with self._lock:
            self.running = False

    def reset(self) -> None:
        with self._lock:
            self._tickets.clear()
            self.running = False


# -- meta/backups: the log and the storage estimate ------------------------------------------


def read_meta(store: Any) -> tuple[dict[str, Any], int]:
    found = store.get_setting(BACKUPS_KEY)
    if found is None:
        return {"log": [], "storage": None}, 0
    data, version = found
    log = data.get("log") if isinstance(data.get("log"), list) else []
    storage = data.get("storage") if isinstance(data.get("storage"), dict) else None
    return {"log": log, "storage": storage}, version


def update_meta(
    store: Any, *, entry: dict[str, Any] | None = None, storage: dict[str, Any] | None = None
) -> None:
    """Append a log entry and/or replace the storage estimate (optimistic, one retry)."""
    for attempt in range(3):
        meta, version = read_meta(store)
        if entry is not None:
            meta["log"] = [*meta["log"], entry][-LOG_KEEP:]
        if storage is not None:
            meta["storage"] = storage
        try:
            store.put_setting(BACKUPS_KEY, meta, expect_version=version)
            return
        except Conflict:
            if attempt == 2:
                raise


def storage_json(est_bytes: int, docs: int, at: datetime) -> dict[str, Any]:
    return {"estBytes": est_bytes, "docs": docs, "asOf": iso_utc(at)}


# -- the run -------------------------------------------------------------------------------------


def stream(runtime: Any, ticket: Ticket) -> Iterator[bytes]:
    """The .backup bytes; a sync generator (StreamingResponse runs it in the thread pool).

    `runtime.backups.start()` must have succeeded; this generator always calls `done()`.
    """
    site = runtime.site
    entered: list[Maintenance] = []
    try:
        if ticket.require_read_only and runtime.maintenance_mode == "off":
            replaced: list[Maintenance] = []

            def enter(current: SiteSettings) -> SiteSettings:
                replaced[:] = [current.maintenance]  # update() may retry: keep the last read
                return replace(current, maintenance=Maintenance("read_only", BACKUP_MESSAGE, None))

            site.update(enter)
            entered.append(replaced[0])  # only once read-only is really set
        else:
            site.refresh()
        consistent = runtime.maintenance_mode in ("read_only", "full")
        settings = runtime.settings
        current = site.current()
        writer = BackupWriter(
            runtime.store,
            source=BackupSource(
                version=__version__,
                commit=settings.git_commit,
                store=runtime.store.kind,  # the store the data comes from (what the reader reports)
                project=settings.firebase_project_id if runtime.store.kind == "firestore" else None,
                origin=settings.public_origin,
            ),
            created_at=runtime.clock.now(),
            site={"tz": current.tz, "notice": current.notice},
            estimated={"user": ticket.estimate.users, "progress": ticket.estimate.docs},
            consistent=consistent,
            passphrase=ticket.passphrase,
            max_bytes=settings.max_backup_bytes,
        )
        yield from writer.chunks()
        result = writer.result
        if result is not None:
            now = runtime.clock.now()
            entry = {
                "at": iso_utc(now),
                "bytes": result.bytes,
                "fileSha256": result.file_sha256,
                "counts": result.counts,
                "encrypted": result.encrypted,
                "consistent": result.consistent,
            }
            try:
                update_meta(
                    runtime.store, entry=entry, storage=storage_json(result.storage_bytes, result.docs, now)
                )
            except StoreError as exc:
                logger.warning("Backup finished but its log entry was not saved: %s", exc)
            logger.info(
                "Backup written: %s bytes, sha256 %s, %s", result.bytes, result.file_sha256, result.counts
            )
    finally:
        try:
            if entered:

                def leave(current: SiteSettings) -> SiteSettings:
                    if current.maintenance.mode != "read_only":
                        return current  # an admin changed the mode during the run: keep it
                    return replace(current, maintenance=entered[0])

                site.update(leave)
        except StoreError:
            logger.exception("Backup: could not restore the maintenance mode; set it on the admin page")
        finally:
            runtime.backups.done()
