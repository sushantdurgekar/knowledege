"""The admin API under /api/admin (build-contracts.md section 19). Admins only:
everyone else gets 404 `not_found` (see `auth.py`); non-GET routes are CSRF-protected.

    GET  /stats                     meters, quota day, storage, host, jobs, last backup
    POST /stats/recount             storage estimate from n_* (1 read per doc; <= 20% of today's reads)
    GET  /maintenance               {mode, message, until, version, forced, stored}
    PUT  /maintenance               {mode, message?, until?, version?, confirm:"FULL" for full}
    GET  /settings                  {tz, notice, version}
    PUT  /settings                  {tz?, notice?, version?}
    POST /jobs                      {kind:"maintenance", mode, startAt: ISO|"tonight", tz?,
                                    durationMin, message?}
    GET  /jobs, GET /jobs/{id}
    POST /jobs/{id}/cancel          {confirm:"CANCEL"}
    GET  /backups/estimate, POST /backups, GET /backups/log, GET /backups/{ticket}

Optimistic `version`: when a body carries one it must equal the stored version
(409 `conflict` otherwise); without it the write applies to the latest version.
"""

from __future__ import annotations

import logging
from dataclasses import replace
from datetime import datetime, timedelta
from typing import Annotated, Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.background import BackgroundTask
from starlette.concurrency import run_in_threadpool

from app.admin import backups as backup_api
from app.admin import stats as stats_api
from app.admin.auth import (
    CONFIRM_BACKUP,
    CONFIRM_CANCEL_JOB,
    CONFIRM_FULL_MAINTENANCE,
    require_admin,
    require_destructive,
)
from app.admin.site import MAX_MESSAGE, MAX_NOTICE, MODES, Maintenance, SiteSettings
from app.auth.csrf import csrf_protect
from app.auth.deps import Viewer
from app.backup.crypto import MIN_PASSPHRASE
from app.errors import ApiError
from app.jobs.scheduler import parse_iso, tonight
from app.progress.validate import loads, read_body
from app.quota.pacific import iso_utc
from app.runtime import Runtime, get_runtime
from app.store.base import Conflict, QuotaExhausted, StoreError, new_job_id

logger = logging.getLogger(__name__)

NO_STORE = {"Cache-Control": "no-store"}
MAX_BODY = 16 * 1024
MAX_PASSPHRASE = 1024
MAX_DAYS_AHEAD = 60
RECOUNT_SHARE = 0.2

router = APIRouter(prefix="/api/admin", dependencies=[Depends(require_admin)])
Admin = Annotated[Viewer, Depends(require_admin)]
CSRF = [Depends(csrf_protect)]


# -- helpers -----------------------------------------------------------------------------------


async def _body(request: Request) -> dict[str, Any]:
    raw = await read_body(request, max_wire=MAX_BODY, max_decompressed=MAX_BODY)
    data = loads(raw) if raw.strip() else {}
    if not isinstance(data, dict):
        raise ApiError(422, "invalid", "Body must be a JSON object")
    return data


def _store_error(exc: StoreError) -> ApiError:
    if isinstance(exc, Conflict):
        return ApiError(409, "conflict", "Changed by someone else; reload and try again")
    if isinstance(exc, QuotaExhausted):
        return ApiError(503, "unavailable", "The daily quota is used up", retry_at=exc.retry_at)
    return ApiError(503, "unavailable", "The store is unavailable right now", retry_after=15)


async def _call(fn: Any, *args: Any, **kwargs: Any) -> Any:
    try:
        return await run_in_threadpool(fn, *args, **kwargs)
    except StoreError as exc:
        logger.warning("Admin store call failed: %s", exc)
        raise _store_error(exc) from None


def _text(data: dict[str, Any], name: str, limit: int) -> str | None:
    value = data.get(name)
    if value is None or value == "":
        return None
    if not isinstance(value, str) or len(value) > limit:
        raise ApiError(422, "invalid", f"{name} must be text of at most {limit} characters")
    return value.strip() or None


def _version(data: dict[str, Any]) -> int | None:
    value = data.get("version")
    if value is None:
        return None
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise ApiError(422, "invalid", "version must be a non-negative integer")
    return value


def _zone(name: Any) -> str:
    if not isinstance(name, str) or not name:
        raise ApiError(422, "invalid", "tz must be an IANA time zone such as Asia/Kolkata")
    try:
        ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        raise ApiError(422, "invalid", f"Unknown time zone {name!r}") from None
    return name


def _identity(admin: Viewer) -> Any:
    assert admin.identity is not None  # noqa: S101 - require_admin guarantees it
    return admin.identity


def _ms_iso(moment: datetime) -> str:
    return moment.strftime("%Y-%m-%dT%H:%M:%S.") + f"{moment.microsecond // 1000:03d}Z"


# -- stats ------------------------------------------------------------------------------------


@router.get("/stats")
async def stats(request: Request, admin: Admin) -> JSONResponse:
    runtime = get_runtime(request)
    body = await _call(stats_api.build_stats, runtime)
    return JSONResponse(body, headers=NO_STORE)


@router.post("/stats/recount", dependencies=CSRF)
async def recount(request: Request, admin: Admin) -> JSONResponse:
    runtime = get_runtime(request)
    docs = await _call(runtime.store.count_docs, "progress")
    left = max(0, runtime.settings.quota_reads - runtime.meter.today()["reads"])
    if docs > RECOUNT_SHARE * runtime.settings.quota_reads or docs > left:
        raise ApiError(409, "quota", f"A recount reads {docs} documents: more than 20% of today's reads")
    scanned, total = await _call(runtime.store.storage_scan)
    storage = backup_api.storage_json(total, scanned, runtime.clock.now())
    await _call(backup_api.update_meta, runtime.store, storage=storage)
    return JSONResponse({"storage": storage}, headers=NO_STORE)


# -- maintenance and settings -----------------------------------------------------------------


def _maintenance_json(runtime: Runtime) -> dict[str, Any]:
    current = runtime.site.current()
    return {
        **runtime.site.maintenance().to_json(),
        "version": current.version,
        "forced": runtime.site.forced,
        "stored": current.maintenance.stored_json(),
        "upcoming": runtime.upcoming(),
    }


@router.get("/maintenance")
async def get_maintenance(request: Request, admin: Admin) -> JSONResponse:
    runtime = get_runtime(request)
    await _call(runtime.site.refresh)
    return JSONResponse(_maintenance_json(runtime), headers=NO_STORE)


@router.put("/maintenance", dependencies=CSRF)
async def put_maintenance(request: Request, admin: Admin) -> JSONResponse:
    runtime = get_runtime(request)
    data = await _body(request)
    mode = data.get("mode")
    if mode not in MODES:
        raise ApiError(422, "invalid", "mode must be off, read_only or full")
    message = _text(data, "message", MAX_MESSAGE)
    until_raw = data.get("until")
    until = parse_iso(until_raw)
    if until_raw not in (None, "") and until is None:
        raise ApiError(422, "invalid", "until must be an ISO date-time with a time zone")
    if mode == "full" and runtime.site.current().maintenance.mode != "full":
        require_destructive(runtime, _identity(admin), data, CONFIRM_FULL_MAINTENANCE)
    wanted = Maintenance(str(mode), message, iso_utc(until) if until else None)
    await _call(runtime.site.set_maintenance, wanted, expect_version=_version(data))
    logger.info("Maintenance set to %s by an admin", mode)
    return JSONResponse(_maintenance_json(runtime), headers=NO_STORE)


def _settings_json(current: SiteSettings) -> dict[str, Any]:
    return {"tz": current.tz, "notice": current.notice, "version": current.version}


@router.get("/settings")
async def get_settings(request: Request, admin: Admin) -> JSONResponse:
    runtime = get_runtime(request)
    current = await _call(runtime.site.refresh)
    return JSONResponse(_settings_json(current), headers=NO_STORE)


@router.put("/settings", dependencies=CSRF)
async def put_settings(request: Request, admin: Admin) -> JSONResponse:
    runtime = get_runtime(request)
    data = await _body(request)
    changes: dict[str, Any] = {}
    if "tz" in data:
        changes["tz"] = _zone(data["tz"])
    if "notice" in data:
        changes["notice"] = _text(data, "notice", MAX_NOTICE)
    updated = await _call(runtime.site.update, lambda s: replace(s, **changes), expect_version=_version(data))
    return JSONResponse(_settings_json(updated), headers=NO_STORE)


# -- jobs ----------------------------------------------------------------------------------------


def _start_at(value: Any, tz: str, now: datetime) -> datetime:
    if value == "tonight":
        return tonight(tz, now)
    if not isinstance(value, str) or not value:
        raise ApiError(422, "invalid", 'startAt must be an ISO date-time or "tonight"')
    try:
        moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise ApiError(422, "invalid", 'startAt must be an ISO date-time or "tonight"') from None
    if moment.tzinfo is None:  # a wall-clock time in the job's time zone
        moment = moment.replace(tzinfo=ZoneInfo(tz))
    return moment


@router.post("/jobs", dependencies=CSRF)
async def create_job(request: Request, admin: Admin) -> JSONResponse:
    runtime = get_runtime(request)
    data = await _body(request)
    if data.get("kind") != "maintenance":
        raise ApiError(422, "invalid", 'kind must be "maintenance" (restore jobs arrive in M3)')
    mode = data.get("mode")
    if mode not in ("read_only", "full"):
        raise ApiError(422, "invalid", "mode must be read_only or full")
    tz = _zone(data.get("tz") or runtime.site.current().tz)
    now = runtime.clock.now()
    start = _start_at(data.get("startAt"), tz, now)
    if start < now - timedelta(minutes=1) or start > now + timedelta(days=MAX_DAYS_AHEAD):
        raise ApiError(422, "invalid", f"startAt must be between now and {MAX_DAYS_AHEAD} days ahead")
    minutes = data.get("durationMin")
    if not isinstance(minutes, int) or isinstance(minutes, bool) or not 1 <= minutes <= 24 * 60:
        raise ApiError(422, "invalid", "durationMin must be 1-1440")
    message = _text(data, "message", MAX_MESSAGE)
    identity = _identity(admin)
    if mode == "full":
        require_destructive(runtime, identity, data, CONFIRM_FULL_MAINTENANCE)
    job = {
        "id": new_job_id(runtime.clock.now_ms()),
        "kind": "maintenance",
        "state": "scheduled",
        "mode": mode,
        "startAt": iso_utc(start),
        "endAt": iso_utc(start + timedelta(minutes=minutes)),
        "tz": tz,
        "durationMin": minutes,
        "message": message,
        "createdAt": _ms_iso(now),
        "createdBy": identity.email,
    }
    await _call(runtime.store.put_job, job)
    await _call(runtime.scheduler.refresh)  # the upcoming notice and the next tick see it now
    logger.info(
        "Maintenance %s scheduled at %s for %d min (job %s)", mode, job["startAt"], minutes, job["id"]
    )
    return JSONResponse({"job": job}, status_code=201, headers=NO_STORE)


@router.get("/jobs")
async def list_jobs(request: Request, admin: Admin) -> JSONResponse:
    runtime = get_runtime(request)
    jobs = await _call(runtime.store.list_jobs, None, 50)
    return JSONResponse({"jobs": jobs}, headers=NO_STORE)


async def _job(runtime: Runtime, job_id: str) -> dict[str, Any]:
    if not job_id or len(job_id) > 64 or "/" in job_id:
        raise ApiError(404, "not_found", "No such job")
    job = await _call(runtime.store.get_job, job_id)
    if job is None:
        raise ApiError(404, "not_found", "No such job")
    return dict(job)


@router.get("/jobs/{job_id}")
async def get_job(request: Request, job_id: str, admin: Admin) -> JSONResponse:
    return JSONResponse({"job": await _job(get_runtime(request), job_id)}, headers=NO_STORE)


def _cancel(runtime: Runtime, job: dict[str, Any], holder: str) -> dict[str, Any] | None:
    store = runtime.store
    job_id = str(job["id"])
    state = job.get("state")
    if state == "scheduled":
        if not store.claim_job(job_id, holder, {"scheduled"}, to_state="cancelled"):
            return None
    elif state == "running":
        # End the window now: back to the previous mode first, so a failure leaves the job
        # running (the admin retries, or the scheduler restores it at the window's end).
        runtime.scheduler.restore(job)
        if not store.claim_job(job_id, holder, {"running"}, to_state="cancelled"):
            return None
    else:
        return None
    stored = store.get_job(job_id) or job
    stored["finishedAt"] = iso_utc(runtime.clock.now())
    store.put_job(stored)
    runtime.scheduler.refresh()
    return stored


@router.post("/jobs/{job_id}/cancel", dependencies=CSRF)
async def cancel_job(request: Request, job_id: str, admin: Admin) -> JSONResponse:
    runtime = get_runtime(request)
    data = await _body(request)
    identity = _identity(admin)
    require_destructive(runtime, identity, data, CONFIRM_CANCEL_JOB)
    job = await _job(runtime, job_id)
    cancelled = await _call(_cancel, runtime, job, f"admin:{admin.public_id}")
    if cancelled is None:
        raise ApiError(409, "conflict", f"The job is {job.get('state')} and can no longer be cancelled")
    return JSONResponse({"job": cancelled}, headers=NO_STORE)


# -- backups -------------------------------------------------------------------------------------


@router.get("/backups/estimate")
async def backup_estimate(request: Request, admin: Admin) -> JSONResponse:
    est = await _call(backup_api.estimate, get_runtime(request))
    return JSONResponse(est.to_json(), headers=NO_STORE)


@router.get("/backups/log")
async def backup_log(request: Request, admin: Admin) -> JSONResponse:
    meta, _ = await _call(backup_api.read_meta, get_runtime(request).store)
    return JSONResponse(list(reversed(meta["log"])), headers=NO_STORE)


@router.post("/backups", dependencies=CSRF)
async def create_backup(request: Request, admin: Admin) -> JSONResponse:
    runtime = get_runtime(request)
    data = await _body(request)
    identity = _identity(admin)
    require_destructive(runtime, identity, data, CONFIRM_BACKUP)
    passphrase = data.get("passphrase")
    if passphrase is not None and (
        not isinstance(passphrase, str) or not MIN_PASSPHRASE <= len(passphrase) <= MAX_PASSPHRASE
    ):
        raise ApiError(
            422, "invalid", f"The passphrase must be {MIN_PASSPHRASE} to {MAX_PASSPHRASE} characters"
        )
    require_read_only = data.get("requireReadOnly", True)
    if not isinstance(require_read_only, bool):
        raise ApiError(422, "invalid", "requireReadOnly must be true or false")
    if runtime.backups.running:
        raise ApiError(409, "busy", "A backup is already running")
    est = await _call(backup_api.estimate, runtime)
    if not est.fits:
        raise ApiError(
            409,
            "quota",
            f"The backup needs about {est.est_reads} reads; {est.reads_left} are left today "
            "(20% stay in reserve). Try after the quota reset.",
        )
    ticket = runtime.backups.create(
        identity.uid, passphrase=passphrase, require_read_only=require_read_only, est=est
    )
    body = {"ticket": ticket.id, "filename": ticket.filename, "expiresIn": backup_api.TICKET_TTL_S}
    return JSONResponse(body, headers=NO_STORE)


def _close(gen: Any, runtime: Runtime) -> None:
    """After the response: close the generator (runs its cleanup if a client left early)."""
    try:
        gen.close()
    finally:
        runtime.backups.done()


@router.get("/backups/{ticket}")
async def download_backup(request: Request, ticket: str, admin: Admin) -> StreamingResponse:
    runtime = get_runtime(request)
    identity = _identity(admin)
    found = runtime.backups.take(ticket, identity.uid) if len(ticket) <= 128 else None
    if found is None:
        raise ApiError(404, "not_found", "This backup link has expired or was already used")
    if not runtime.backups.start():
        raise ApiError(409, "busy", "A backup is already running")
    gen = backup_api.stream(runtime, found)
    headers = {
        **NO_STORE,
        "Content-Disposition": f'attachment; filename="{found.filename}"',
        "X-Content-Type-Options": "nosniff",
    }
    return StreamingResponse(
        gen,
        media_type="application/octet-stream",
        headers=headers,
        background=BackgroundTask(_close, gen, runtime),
    )


# -- everything else under /api/admin ----------------------------------------------------------------
# Last route of the router: any other path or method under /api/admin is a full match here,
# so the router's admin check runs first and a non-admin gets the same 404 as for an
# unknown /api path (Starlette would otherwise answer a wrong method with a revealing 405).

ANY_METHOD = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]


@router.api_route("/{rest:path}", methods=ANY_METHOD, dependencies=CSRF, include_in_schema=False)
async def admin_fallback(request: Request, rest: str, admin: Admin) -> JSONResponse:
    allowed: set[str] = set()
    for route in request.app.router.routes:
        path = getattr(route, "path", "")
        if (
            path.startswith("/api/admin/")
            and path != "/api/admin/{rest:path}"
            and route.path_regex.match(request.url.path)  # type: ignore[attr-defined]
        ):
            allowed |= set(getattr(route, "methods", ()) or ())
    if allowed:
        allow = ", ".join(sorted(allowed))
        raise ApiError(405, "method_not_allowed", "Method Not Allowed", headers={"Allow": allow})
    raise ApiError(404, "not_found", "No such API endpoint")
