"""Restore validation and the restore job (build-contracts.md section 24, spec section 4.10).

Validation (a background thread per upload): `reader.validate_file` checks the upload
end to end and writes `ready.ndjson.gz`, then `plan.build_plan` compares it with the
target. Nothing is written to the target; the passphrase only lives in that thread.

The job (the scheduler calls `step` on every tick for `kind: "restore"` jobs):

1. `scheduled` at `runAt` -> claimed atomically (`claim_job`) -> a runner thread.
2. Full maintenance: the job first records the mode it replaces (`prev`), then sets
   `full`; a resumed job only re-asserts `full`. A fresh start then waits `drain_s`
   (the 60 s settings cache + 5 s; 0 under APP_ENV=test) before its first read of the
   target, so a sync or an account deletion that passed the maintenance check just
   before (here, or on an instance with an older cache) has finished: a uid deleted
   then is seen as tombstoned and skipped, never written back.
3. Records stream from `checkpoint.line + 1` in batches (<= 500 records or 4 MiB;
   Firestore <= 399 records so the WriteBatch with its checkpoint stays <= 400 docs).
   `store.restore_batch` applies each batch and its checkpoint atomically and exactly
   once. Uids tombstoned in the backup or in the target are skipped (counted).
   Firestore is throttled from 50 ops/s, +50% every 5 min; when today's write budget
   would be exceeded (or Firestore says `ResourceExhausted`) the job goes to
   `paused_quota` and resumes at the next Pacific reset + 5 min.
4. `replace` (Postgres, memory): the batches stage rows; `swap_replace` then swaps them
   in at once, and the backup's site settings (tz, notice) are applied.
5. A heartbeat every 20 s. A `running` job whose heartbeat is more than 2 min old (its
   instance died) is reclaimed with a compare-and-set and resumed from its checkpoint.
6. Verify: written + kept + skipped = the `end` counts for every record type, and a 1%
   sample (<= 200 parts) re-read from the target matches the backup (sha256).
7. Success: checkpoint `verified`, staging deleted, the previous mode restored when
   `exitMaintenanceOnSuccess`, state `succeeded`. Failure: `full` stays on, the job goes
   to `needs_attention` with its report (the admin overview shows a banner).

States: scheduled -> running -> (paused_quota -> running)* -> succeeded | needs_attention
| failed | cancelled | missed.
"""

from __future__ import annotations

import gzip
import hashlib
import logging
import math
import threading
import time
from collections.abc import Callable
from dataclasses import replace
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.admin.site import MAX_NOTICE, Maintenance, SiteSettings, SiteSettingsCache
from app.admin.site import REFRESH_S as SETTINGS_REFRESH_S
from app.backup import reader
from app.clock import Clock
from app.config import Settings
from app.progress.validate import compact_json, done_count, encode_gz
from app.quota.pacific import iso_utc, next_reset
from app.restore.plan import build_plan
from app.restore.uploads import UploadError, Uploads
from app.store.base import (
    RESTORE_KINDS,
    Conflict,
    JobLost,
    PartIn,
    QuotaExhausted,
    RestoreItem,
    Store,
    StoreError,
    Tombstone,
    UserRecord,
    empty_counts,
    tombstone_hash,
)

logger = logging.getLogger(__name__)

HEARTBEAT_S = 20.0
STALE_AFTER = timedelta(minutes=2)
RESUME_AFTER_RESET = timedelta(minutes=5)
BATCH_RECORDS = 500
BATCH_BYTES = 4 * 1024 * 1024
FS_BATCH_RECORDS = 399
FS_RATE_START = 50.0  # ops/s
FS_RATE_STEP = 1.5  # x every FS_RATE_EVERY_S
FS_RATE_EVERY_S = 300.0
SAMPLE_SHARE = 100  # 1%
SAMPLE_MAX = 200
RETRIES = 5
RECORD_OVERHEAD = 200
DRAIN_S = SETTINGS_REFRESH_S + 5.0  # every instance sees `full`, in-flight requests end
MESSAGE = "Study Hubs is being restored from a backup. Your progress is saved in this browser."


def parse_iso(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return moment if moment.tzinfo is not None else None


def public_job(job: dict[str, Any]) -> dict[str, Any]:
    """A job as the admin API shows it: restore jobs get `progress {done, total}`."""
    if job.get("kind") != "restore":
        return job
    checkpoint = job.get("checkpoint") or {}
    return {**job, "progress": {"done": int(checkpoint.get("line", 0)), "total": int(job.get("total") or 0)}}


class _Restart(Exception):  # noqa: N818 - control flow: re-read the job and continue
    pass


class _Paused(Exception):  # noqa: N818 - control flow: the quota pause is recorded
    pass


class RestoreService:
    def __init__(
        self,
        store: Store,
        site: SiteSettingsCache,
        settings: Settings,
        clock: Clock,
        uploads: Uploads,
        *,
        holder: str,
        writes_today: Callable[[], int] = lambda: 0,
        reads_today: Callable[[], int] = lambda: 0,
        sleep: Callable[[float], None] = time.sleep,
        monotonic: Callable[[], float] = time.monotonic,
        batch_delay_s: float = 0.0,
        fs_rate: float = FS_RATE_START,
        drain_s: float = DRAIN_S,
    ) -> None:
        self.store = store
        self.site = site
        self.settings = settings
        self.clock = clock
        self.uploads = uploads
        self.holder = holder
        self._writes_today = writes_today
        self._reads_today = reads_today
        self._sleep = sleep
        self._mono = monotonic
        self.batch_delay_s = batch_delay_s
        self.drain_s = drain_s
        self.fs_rate = fs_rate
        self._lock = threading.Lock()
        self.on_change: Callable[[], None] = lambda: None  # the scheduler's cache invalidation
        self._threads: dict[str, threading.Thread] = {}
        self._validations: dict[str, threading.Thread] = {}
        self._beat: dict[str, float] = {}

    def reset(self) -> None:
        """Forget every staged upload (`POST /api/test/reset`)."""
        for upload in self.uploads.all():
            self.uploads.discard(upload.id)

    # -- validation ---------------------------------------------------------------------------

    def validate_async(self, upload_id: str, passphrase: str | None) -> None:
        self.uploads.begin_validation(upload_id)
        thread = threading.Thread(
            target=self._validate,
            args=(upload_id, passphrase),
            name=f"restore-validate-{upload_id}",
            daemon=True,
        )
        with self._lock:
            self._validations[upload_id] = thread
        thread.start()

    def wait_validation(self, upload_id: str, timeout: float = 60.0) -> None:
        with self._lock:
            thread = self._validations.get(upload_id)
        if thread is not None:
            thread.join(timeout)

    def _validate(self, upload_id: str, passphrase: str | None) -> None:
        header: dict[str, Any] | None = None
        try:
            part = self.uploads.part_path(upload_id)
            ready = self.uploads.ready_path(upload_id)
            try:
                with part.open("rb") as f:
                    header = reader.header_summary(reader.read_preamble(f))  # type: ignore[arg-type]
            except reader.Invalid:
                header = None
            pre, verified = reader.validate_file(
                part, ready, passphrase=passphrase, max_part_gz=self.settings.max_part_gz
            )
            passphrase = None  # dropped once the file is decrypted
            report = self.report(pre, verified, ready)
            self.uploads.finish_validation(upload_id, report=report, error=None, header=header)
            logger.info("Restore upload %s validated: %s", upload_id, verified.counts)
        except reader.Invalid as exc:
            logger.warning("Restore upload %s is invalid: %s", upload_id, exc)
            self.uploads.finish_validation(upload_id, report=None, error=str(exc), header=header)
        except StoreError as exc:
            logger.warning("Restore upload %s: the plan failed: %s", upload_id, exc)
            self.uploads.finish_validation(
                upload_id, report=None, error=f"the target store is unavailable: {exc}", header=header
            )
        except Exception as exc:
            logger.exception("Restore upload %s: validation failed", upload_id)
            self.uploads.finish_validation(
                upload_id, report=None, error=f"validation failed: {exc}", header=header
            )
        finally:
            with self._lock:
                self._validations.pop(upload_id, None)

    def report(self, pre: reader.Preamble, verified: reader.Verified, ready: Path) -> dict[str, Any]:
        settings = self.settings
        budget = int(settings.write_budget)
        plan = build_plan(
            self.store,
            ready,
            verified.counts,
            reads_left=max(0, settings.quota_reads - self._reads_today()),
            writes_left=max(0, budget - self._writes_today()),
            writes_per_day=budget,
        )
        target = {
            "store": self.store.kind,
            "users": self.store.count_users(),
            "progress": self.store.count_docs("progress"),
        }
        return {
            "header": reader.header_summary(pre),
            "counts": verified.counts,
            "records": sum(verified.counts.values()),
            "linesSha256": verified.lines_sha256,
            "fileSha256": verified.file_sha256,
            "bytes": verified.size,
            "target": target,
            "plan": plan,
            "modes": ["merge"] if self.store.kind == "firestore" else ["merge", "replace"],
        }

    # -- the scheduler's hook ------------------------------------------------------------------------

    def running(self, job_id: str) -> bool:
        with self._lock:
            thread = self._threads.get(job_id)
            return thread is not None and thread.is_alive()

    def step(self, job: dict[str, Any], now: datetime, grace: timedelta) -> str | None:
        """Advance one restore job (scheduler tick). Never blocks on the restore itself."""
        job_id = str(job.get("id"))
        if self.running(job_id):
            return None
        state = job.get("state")
        store = self.store
        if state == "scheduled":
            run_at = parse_iso(job.get("runAt"))
            if run_at is None:
                if store.claim_job(job_id, self.holder, {"scheduled"}, to_state="failed"):
                    self._note(job_id, now, error="invalid runAt")
                    return f"failed {job_id}"
                return None
            if now < run_at:
                return None
            if now - run_at > grace:
                if store.claim_job(job_id, self.holder, {"scheduled"}, to_state="missed"):
                    late = int((now - run_at).total_seconds() // 60)
                    self._note(job_id, now, error=f"missed: the server was {late} min late")
                    return f"missed {job_id}"
                return None
            if store.claim_job(job_id, self.holder, {"scheduled"}):
                self._start(job_id)
                return f"started {job_id}"
            return None
        if state == "paused_quota":
            resume = parse_iso(job.get("resumeAt"))
            if (
                resume is not None
                and now >= resume
                and store.claim_job(job_id, self.holder, {"paused_quota"})
            ):
                self._start(job_id)
                return f"resumed {job_id}"
            return None
        if state == "running":
            if job.get("holder") == self.holder:
                # Ours but no thread: the cache may predate a pause or the end; re-read it.
                current = store.get_job(job_id)
                if (
                    current is None
                    or current.get("state") != "running"
                    or current.get("holder") != self.holder
                ):
                    self.on_change()
                    return None
                self._start(job_id)  # it stopped early: carry on
                return f"resumed {job_id}"
            beat = parse_iso(job.get("heartbeat")) or parse_iso(job.get("claimedAt"))
            if beat is not None and now - beat <= STALE_AFTER:
                return None
            expect = {"state": "running", "holder": job.get("holder"), "heartbeat": job.get("heartbeat")}
            fields = {"holder": self.holder, "heartbeat": iso_utc(now), "reclaimedAt": iso_utc(now)}
            if store.update_job(job_id, fields, expect=expect):
                logger.warning("Restore job %s: heartbeat stale, reclaimed and resumed", job_id)
                self._start(job_id)
                return f"reclaimed {job_id}"
        return None

    def _start(self, job_id: str) -> None:
        with self._lock:
            current = self._threads.get(job_id)
            if current is not None and current.is_alive():
                return
            thread = threading.Thread(target=self._run, args=(job_id,), name=f"restore-{job_id}", daemon=True)
            self._threads[job_id] = thread
            self._beat[job_id] = float("-inf")
        thread.start()

    def join(self, job_id: str, timeout: float = 60.0) -> None:
        with self._lock:
            thread = self._threads.get(job_id)
        if thread is not None:
            thread.join(timeout)

    def _note(self, job_id: str, now: datetime, *, error: str) -> None:
        self.store.update_job(job_id, {"finishedAt": iso_utc(now), "error": error}, expect={})

    # -- the runner thread --------------------------------------------------------------------------

    def _run(self, job_id: str) -> None:
        try:
            for _ in range(RETRIES * 4):
                try:
                    self._execute(job_id)
                    return
                except _Restart:
                    continue
            self._fail(job_id, "the job kept changing under the runner")
        except (JobLost, _Paused):
            return
        except Exception as exc:
            logger.exception("Restore job %s failed", job_id)
            try:
                self._fail(job_id, f"{type(exc).__name__}: {exc}")
            except Exception:
                logger.exception("Restore job %s: could not record the failure", job_id)
        finally:
            with self._lock:
                self._beat.pop(job_id, None)
            self.on_change()  # the scheduler re-reads the job on its next tick

    def _job(self, job_id: str) -> dict[str, Any]:
        job = self._retry(self.store.get_job, job_id)
        if job is None or job.get("state") != "running" or job.get("holder") != self.holder:
            raise JobLost("the job is not ours to run")
        return job

    def _mine(self) -> dict[str, Any]:
        return {"holder": self.holder, "state": "running"}

    def _set(self, job_id: str, fields: dict[str, Any]) -> None:
        if not self._retry(self.store.update_job, job_id, fields, expect=self._mine()):
            raise JobLost("the job is no longer ours")

    def heartbeat(self, job_id: str, *, force: bool = False) -> None:
        now = self._mono()
        with self._lock:
            due = force or now - self._beat.get(job_id, float("-inf")) >= HEARTBEAT_S
        if not due:
            return
        self._set(job_id, {"heartbeat": iso_utc(self.clock.now())})
        with self._lock:
            self._beat[job_id] = now

    def _retry(self, fn: Callable[..., Any], /, *args: Any, **kwargs: Any) -> Any:
        """Retry a store call on `Unavailable` (1, 2, 4, 8 s); quota and logic errors pass."""
        delay = 1.0
        for attempt in range(RETRIES):
            try:
                return fn(*args, **kwargs)
            except (QuotaExhausted, Conflict, JobLost):
                raise
            except StoreError:
                if attempt == RETRIES - 1:
                    raise
                self._sleep(delay)
                delay *= 2
        raise AssertionError("unreachable")  # pragma: no cover

    def _execute(self, job_id: str) -> None:
        job = self._job(job_id)
        self.heartbeat(job_id, force=True)
        checkpoint = dict(job.get("checkpoint") or {})
        phase = checkpoint.get("phase", "apply")
        mode = str(job.get("mode") or "merge")
        upload_id = str(job.get("uploadId"))
        ready = self.uploads.ready_path(upload_id)
        if phase != "verified" and not ready.is_file():
            self._fail(
                job_id,
                "the validated upload is gone (is DATA_DIR persistent here?): upload and validate it again",
                state="failed" if not checkpoint.get("line") else "needs_attention",
            )
            return
        if phase != "verified" and not self._same_upload(job, upload_id):
            self._fail(
                job_id,
                "the upload changed after this job was confirmed: validate it and start a new restore",
                state="failed" if not checkpoint.get("line") else "needs_attention",
            )
            return
        self._enter_full(job)
        if phase != "verified":
            if phase == "apply":
                checkpoint = self._apply(job, ready, checkpoint)
                if mode == "replace":
                    checkpoint = self._swap(job, checkpoint)
                else:
                    checkpoint = {**checkpoint, "phase": "applied"}
                    self._set(job_id, {"checkpoint": checkpoint})
            if mode == "replace" and isinstance(checkpoint.get("site"), dict):
                self._apply_site(checkpoint["site"])
            report = self._verify(job, ready, checkpoint)
            if not report["ok"]:
                self._fail(job_id, "verification failed: see the report", report=report)
                return
            checkpoint = {**checkpoint, "phase": "verified"}
            self._set(job_id, {"checkpoint": checkpoint, "report": report})
        self.uploads.discard(upload_id)
        if job.get("exitMaintenanceOnSuccess", True):
            self._leave_full(job)
        now = self.clock.now()
        self._set(job_id, {"state": "succeeded", "finishedAt": iso_utc(now), "updatedAt": iso_utc(now)})
        logger.info("Restore job %s succeeded", job_id)

    def _same_upload(self, job: dict[str, Any], upload_id: str) -> bool:
        """The staged file is still the one validated and confirmed for this job (an upload
        changed or re-validated meanwhile is never applied in its place)."""
        want = job.get("linesSha256")
        if not want:
            return True  # a job created before the field existed: the ready file is checked
        try:
            upload = self.uploads.get(upload_id)
        except UploadError:
            return False
        report = upload.report or {}
        return upload.state == "validated" and report.get("linesSha256") == want

    # -- maintenance -----------------------------------------------------------------------------------

    def _enter_full(self, job: dict[str, Any]) -> None:
        job_id = str(job["id"])
        fresh = "prev" not in job
        if fresh:
            # Record the mode being replaced before changing it: a crash in between then
            # re-enters `full` on resume and still knows what to go back to.
            prev = self._retry(self.site.refresh).maintenance
            self._set(job_id, {"prev": prev.stored_json(), "startedAt": iso_utc(self.clock.now())})
            job["prev"] = prev.stored_json()

        switched = False

        def change(current: SiteSettings) -> SiteSettings:
            nonlocal switched
            switched = current.maintenance.mode != "full"
            if not switched:
                return current
            return replace(current, maintenance=Maintenance("full", MESSAGE, None))

        self._retry(self.site.update, change)
        # Drain whenever this run is what turned `full` on: a fresh start, but also a job
        # resumed or reclaimed after `full` was lost (a crash between recording `prev` and
        # the switch, an admin turning it off during a quota pause). Users may have written
        # until now, so the target is read only once those requests have ended.
        if (fresh or switched) and self.drain_s > 0:
            self._drain(job_id)

    def _drain(self, job_id: str) -> None:
        """Wait (heartbeating) until every instance serves `full` and requests that began
        before it have ended; only then are the target's tombstones and stamps read."""
        until = self.clock.now() + timedelta(seconds=self.drain_s)
        self._set(job_id, {"drainUntil": iso_utc(until)})
        left = self.drain_s
        while left > 0:
            step = min(left, 5.0)
            self._sleep(step)
            left -= step
            self.heartbeat(job_id)

    def _leave_full(self, job: dict[str, Any]) -> None:
        # Re-read: a full window that ended meanwhile handed its previous mode to this job.
        prev = Maintenance.from_json(self._job(str(job["id"])).get("prev"))

        def change(current: SiteSettings) -> SiteSettings:
            if current.maintenance.mode != "full":
                return current  # an admin changed it meanwhile: keep their choice
            return replace(current, maintenance=prev)

        self._retry(self.site.update, change)

    def _apply_site(self, value: dict[str, Any]) -> None:
        """A replace takes the backup's site settings (tz, notice), when they are valid."""
        tz = value.get("tz") if isinstance(value.get("tz"), str) else None
        try:
            if tz:
                ZoneInfo(tz)
        except (ZoneInfoNotFoundError, ValueError):
            tz = None
        notice = value.get("notice") if isinstance(value.get("notice"), str) else None
        if notice is not None and len(notice) > MAX_NOTICE:
            notice = None

        def change(current: SiteSettings) -> SiteSettings:
            wanted = replace(current, tz=tz or current.tz, notice=notice or None)
            return current if wanted == current else wanted

        self._retry(self.site.update, change)

    def _fail(
        self, job_id: str, error: str, *, report: dict[str, Any] | None = None, state: str = "needs_attention"
    ) -> None:
        now = iso_utc(self.clock.now())
        fields: dict[str, Any] = {"state": state, "error": error, "finishedAt": now, "updatedAt": now}
        if report is not None:
            fields["report"] = report
        if self.store.update_job(job_id, fields, expect=self._mine()):
            logger.error("Restore job %s -> %s: %s", job_id, state, error)
            self._wipe_staged(job_id)

    def _wipe_staged(self, job_id: str) -> None:
        """A replace that ended without its swap leaves no import rows behind (a failed job
        never resumes; another run stages its own rows). Best effort: they are keyed by job."""
        try:
            job = self.store.get_job(job_id)
            if job is not None and job.get("mode") == "replace":
                self.store.wipe_for_replace(job_id)
        except StoreError as exc:
            logger.warning("Restore job %s: staged rows not wiped: %s", job_id, exc)

    # -- apply ------------------------------------------------------------------------------------------

    def _limits(self) -> tuple[int, int]:
        if self.store.kind == "firestore":
            return FS_BATCH_RECORDS, BATCH_BYTES
        return BATCH_RECORDS, BATCH_BYTES

    def _budget_left(self) -> int | None:
        """Firestore writes left today under the budget (None: no budget applies)."""
        if self.store.kind != "firestore" or not self.settings.quota_enforce:
            return None
        return int(self.settings.write_budget) - self._writes_today()

    def _cap(self, job_id: str) -> int:
        """Records in the next batch: at most what today's write budget still allows."""
        max_records, _ = self._limits()
        left = self._budget_left()
        if left is None:
            return max_records
        if left < 2:  # one record and the checkpoint
            self._pause(job_id, f"today's write budget is used up ({max(0, left)} writes left)")
            raise _Paused()
        return min(max_records, left - 1)

    def _apply(self, job: dict[str, Any], ready: Path, checkpoint: dict[str, Any]) -> dict[str, Any]:
        job_id = str(job["id"])
        mode = str(job.get("mode") or "merge")
        done = int(checkpoint.get("line", 0))
        cp: dict[str, Any] = {
            "line": done,
            "phase": "apply",
            "written": {**empty_counts(), **(checkpoint.get("written") or {})},
            "kept": {**empty_counts(), **(checkpoint.get("kept") or {})},
            "skipped": {**empty_counts(), **(checkpoint.get("skipped") or {})},
        }
        if "site" in checkpoint:
            cp["site"] = checkpoint["site"]
        _, max_bytes = self._limits()
        max_records = self._cap(job_id)
        stones: set[str] = set()
        target_tomb: dict[str, bool] = {}
        pending: list[tuple[int, dict[str, Any]]] = []
        size = 0
        started = self._mono()
        for line, rec in reader.iter_ready(ready):
            kind = rec.get("t")
            if kind == "tombstone":
                stones.add(rec["h"])
            if kind == "end":
                break
            if line <= done:
                continue
            pending.append((line, rec))
            size += RECORD_OVERHEAD + (len(compact_json(rec["data"])) if kind == "progress" else 0)
            if len(pending) >= max_records or size >= max_bytes:
                cp = self._flush(job_id, mode, cp, pending, stones, target_tomb, started)
                pending, size = [], 0
                max_records = self._cap(job_id)
        if pending:
            cp = self._flush(job_id, mode, cp, pending, stones, target_tomb, started)
        return cp

    def _flush(
        self,
        job_id: str,
        mode: str,
        cp: dict[str, Any],
        pending: list[tuple[int, dict[str, Any]]],
        stones: set[str],
        target_tomb: dict[str, bool],
        started: float,
    ) -> dict[str, Any]:
        unknown = sorted({r["uid"] for _, r in pending if r["t"] in ("user", "progress")} - set(target_tomb))
        if unknown:
            hashes = {tombstone_hash(uid): uid for uid in unknown}
            found = self._call(job_id, self.store.is_tombstoned, list(hashes))
            for h, uid in hashes.items():
                target_tomb[uid] = h in found
        skipped = empty_counts()
        kept = empty_counts()
        items: list[RestoreItem] = []
        site = cp.get("site")
        for line, rec in pending:
            kind = rec["t"]
            if kind == "settings":  # the runner's own: applied after a replace, kept on a merge
                site = rec.get("value") if isinstance(rec.get("value"), dict) else None
                if mode == "merge":
                    kept["settings"] += 1
            elif kind == "tombstone":
                at = parse_iso(rec["at"]) or self.clock.now()
                items.append(RestoreItem("tombstone", line, tombstone=Tombstone(rec["h"], at)))
            elif tombstone_hash(rec["uid"]) in stones or target_tomb.get(rec["uid"]):
                skipped[kind] += 1
            elif kind == "user":
                items.append(RestoreItem("user", line, uid=rec["uid"], user=_user(rec)))
            else:
                items.append(
                    RestoreItem(
                        "progress", line, uid=rec["uid"], hub=rec["hub"], part=rec["part"], data=_part(rec)
                    )
                )
        written_settings = 1 if mode == "replace" and any(r["t"] == "settings" for _, r in pending) else 0
        base = {
            "from": pending[0][0],
            "line": pending[-1][0],
            "phase": "apply",
            "written": {**cp["written"], "settings": cp["written"]["settings"] + written_settings},
            "kept": {k: cp["kept"][k] + kept[k] for k in RESTORE_KINDS},
            "skipped": {k: cp["skipped"][k] + skipped[k] for k in RESTORE_KINDS},
        }
        if site is not None:
            base["site"] = site
        if self.store.kind == "firestore":
            self._throttle(job_id, len(items) + 1, started)
        result = self._call(
            job_id,
            self.store.restore_batch,
            items,
            mode=mode,
            job_id=job_id,
            checkpoint=base,
            holder=self.holder,
        )
        if not result.applied:
            raise _Restart()  # someone (or an earlier attempt) is further: continue from there
        self.heartbeat(job_id)
        if self.batch_delay_s:
            self._sleep(self.batch_delay_s)
        return dict(result.checkpoint)

    def _call(self, job_id: str, fn: Callable[..., Any], /, *args: Any, **kwargs: Any) -> Any:
        try:
            return self._retry(fn, *args, **kwargs)
        except QuotaExhausted as exc:
            self._pause(job_id, f"the store refused for quota ({exc.kind})")
            raise _Paused() from None
        except Conflict:
            raise _Restart() from None

    def _throttle(self, job_id: str, ops: int, started: float) -> None:
        """Firestore: pace writes (50 ops/s, +50% every 5 min) and stop at the day's budget."""
        left = self._budget_left()
        if left is not None and ops > left:
            self._pause(job_id, f"today's write budget is used up ({left} writes left)")
            raise _Paused()
        steps = int((self._mono() - started) // FS_RATE_EVERY_S)
        rate = self.fs_rate * (FS_RATE_STEP**steps)
        wait = ops / rate
        while wait > 0:
            slice_s = min(wait, 5.0)
            self._sleep(slice_s)
            wait -= slice_s
            self.heartbeat(job_id)

    def _pause(self, job_id: str, why: str) -> None:
        now = self.clock.now()
        resume = next_reset(now, self.settings.quota_tz) + RESUME_AFTER_RESET
        fields = {
            "state": "paused_quota",
            "resumeAt": iso_utc(resume),
            "pausedAt": iso_utc(now),
            "pauseReason": why,
        }
        if self.store.update_job(job_id, fields, expect=self._mine()):
            logger.warning("Restore job %s paused until %s: %s", job_id, iso_utc(resume), why)

    # -- replace swap -----------------------------------------------------------------------------------

    def _swap(self, job: dict[str, Any], cp: dict[str, Any]) -> dict[str, Any]:
        job_id = str(job["id"])
        expected = {"user": cp["written"]["user"], "progress": cp["written"]["progress"]}
        final = {**cp, "phase": "swapped"}
        try:
            result = self._retry(
                self.store.swap_replace, job_id, holder=self.holder, expected=expected, checkpoint=final
            )
        except Conflict as exc:
            self._fail(job_id, f"the staged rows do not match the checkpoint ({exc}); run the restore again")
            raise JobLost("failed") from None
        return dict(result.checkpoint)

    # -- verify -------------------------------------------------------------------------------------------

    def _verify(self, job: dict[str, Any], ready: Path, cp: dict[str, Any]) -> dict[str, Any]:
        mode = str(job.get("mode") or "merge")
        end: dict[str, int] = {}
        stones: set[str] = set()
        progress_lines: list[dict[str, Any]] = []
        total = 0
        for _, rec in reader.iter_ready(ready):
            if rec["t"] == "tombstone":
                stones.add(rec["h"])
            elif rec["t"] == "end":
                end = rec["counts"]
            elif rec["t"] == "progress":
                total += 1
        # 1% of the parts (at most 200), evenly spread; a pick that falls on a uid tombstoned
        # in the backup moves to the next live part. Twice as many candidates are kept, so
        # that dropping the target's tombstoned uids still leaves about n.
        n = min(SAMPLE_MAX, math.ceil(total / SAMPLE_SHARE)) if total else 0
        step = max(1, total // n) if n else 1
        index = 0
        wanted = 0
        for _, rec in reader.iter_ready(ready):
            if rec["t"] != "progress":
                continue
            if index % step == 0:
                wanted += 2 if index == 0 else 1
            index += 1
            if wanted and len(progress_lines) < 2 * n and tombstone_hash(rec["uid"]) not in stones:
                progress_lines.append(rec)
                wanted -= 1
        totals = {
            kind: cp["written"].get(kind, 0) + cp["kept"].get(kind, 0) + cp["skipped"].get(kind, 0)
            for kind in RESTORE_KINDS
        }
        counts_ok = all(totals[k] == end.get(k, 0) for k in RESTORE_KINDS)
        sample = self._sample(progress_lines, stones, mode)
        return {
            "mode": mode,
            "endCounts": end,
            "written": cp["written"],
            "kept": cp["kept"],
            "skipped": cp["skipped"],
            "countsOk": counts_ok,
            "sample": sample,
            "ok": counts_ok and sample["mismatched"] == 0,
        }

    def _sample(self, recs: list[dict[str, Any]], stones: set[str], mode: str) -> dict[str, Any]:
        hashes = {tombstone_hash(r["uid"]) for r in recs}
        target = self._retry(self.store.is_tombstoned, sorted(hashes)) if hashes else set()
        n = (len(recs) + 1) // 2
        live = [r for r in recs if tombstone_hash(r["uid"]) not in stones | target][: max(1, n)]
        checked = mismatched = 0
        details: list[dict[str, Any]] = []
        by_doc: dict[tuple[str, str], list[dict[str, Any]]] = {}
        for rec in live:
            by_doc.setdefault((rec["uid"], rec["hub"]), []).append(rec)
        for (uid, hub), group in by_doc.items():
            got = self._retry(self.store.get_hub, uid, hub, {})
            for rec in group:
                checked += 1
                out = got.get(rec["part"])
                ok = out is not None and out.gz is not None
                if ok and out is not None and out.gz is not None:
                    if out.upd < rec["upd"] or (mode == "replace" and out.upd != rec["upd"]):
                        ok = False
                    elif out.upd == rec["upd"]:
                        stored = hashlib.sha256(gzip.decompress(out.gz)).hexdigest()
                        ok = stored == hashlib.sha256(compact_json(rec["data"])).hexdigest()
                if not ok:
                    mismatched += 1
                    if len(details) < 10:
                        details.append({"uid": uid, "hub": hub, "part": rec["part"], "upd": rec["upd"]})
        return {"checked": checked, "mismatched": mismatched, "examples": details}


def _user(rec: dict[str, Any]) -> UserRecord:
    return UserRecord(
        uid=rec["uid"],
        email=rec.get("email"),
        email_verified=bool(rec.get("emailVerified")),
        name=rec.get("name"),
        photo=rec.get("photo"),
        provider=rec.get("provider"),
        created_at=parse_iso(rec.get("createdAt")),
        last_login_at=parse_iso(rec.get("lastLoginAt")),
    )


def _part(rec: dict[str, Any]) -> PartIn:
    data = rec["data"]
    raw = compact_json(data)
    try:
        done = done_count(rec["part"], data)
    except (KeyError, TypeError, ValueError, AttributeError):
        done = None
    return PartIn(upd=int(rec["upd"]), gz=encode_gz(raw), raw_len=len(raw), done=done)
