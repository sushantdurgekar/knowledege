"""The restore API under /api/admin/restore and restore jobs (build-contracts.md section 24).
Admins only (404 for everyone else); every non-GET route is CSRF-protected.

    POST   /restore/uploads                 {name, size, lastModified}
                                            -> {uploadId, chunkSize: 4194304, received: [], ...}
    GET    /restore/uploads                 {uploads: [...]} (at most one)
    PUT    /restore/uploads/{id}/chunks/{n} raw body <= 4 MiB, X-Chunk-SHA256 (hex)
    GET    /restore/uploads/{id}            {state, received, size, report?, error?, ...}
    POST   /restore/uploads/{id}/validate   {passphrase?} -> 202, then poll the GET
    DELETE /restore/uploads/{id}            wipes the staging directory

Restore jobs are created through `POST /api/admin/jobs` (`create_restore_job` below):
`{kind:"restore", uploadId, mode:"merge"|"replace", runAt:"now"|"tonight"|
"after_quota_reset"|ISO, tz, exitMaintenanceOnSuccess, confirm}`, with the destructive
rules: a sign-in within 24 h and `confirm` = "RESTORE" (merge) or "REPLACE <n> USERS"
(replace; n = the target's users counted by the validation's plan).
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Annotated, Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, Response
from starlette.concurrency import run_in_threadpool

from app.admin.auth import require_admin, require_destructive
from app.auth.csrf import csrf_protect
from app.auth.deps import Viewer
from app.errors import ApiError
from app.progress.validate import loads, read_body
from app.quota.pacific import iso_utc, next_reset
from app.restore.runner import RESUME_AFTER_RESET
from app.restore.uploads import CHUNK_SIZE, UploadError
from app.runtime import Runtime, get_runtime
from app.store.base import new_job_id

logger = logging.getLogger(__name__)

NO_STORE = {"Cache-Control": "no-store"}
MAX_BODY = 16 * 1024
MAX_PASSPHRASE = 1024
MAX_DAYS_AHEAD = 60
CONFIRM_RESTORE = "RESTORE"
ACTIVE_RESTORE = {"scheduled", "running", "paused_quota"}

router = APIRouter(prefix="/api/admin/restore", dependencies=[Depends(require_admin)])
Admin = Annotated[Viewer, Depends(require_admin)]
CSRF = [Depends(csrf_protect)]


def confirm_phrase(mode: str, target_users: int) -> str:
    return CONFIRM_RESTORE if mode == "merge" else f"REPLACE {target_users} USERS"


def _error(exc: UploadError) -> ApiError:
    return ApiError(exc.status, exc.code, exc.message)


async def _json(request: Request) -> dict[str, Any]:
    raw = await read_body(request, max_wire=MAX_BODY, max_decompressed=MAX_BODY)
    data = loads(raw) if raw.strip() else {}
    if not isinstance(data, dict):
        raise ApiError(422, "invalid", "Body must be a JSON object")
    return data


async def _uploads_call(fn: Any, *args: Any, **kwargs: Any) -> Any:
    try:
        return await run_in_threadpool(fn, *args, **kwargs)
    except UploadError as exc:
        raise _error(exc) from None


def _jobs_using(runtime: Runtime, upload_id: str) -> list[dict[str, Any]]:
    jobs = runtime.store.list_jobs(ACTIVE_RESTORE, limit=50)
    return [j for j in jobs if j.get("kind") == "restore" and j.get("uploadId") == upload_id]


@router.post("/uploads", dependencies=CSRF)
async def create_upload(request: Request, admin: Admin) -> JSONResponse:
    runtime = get_runtime(request)
    data = await _json(request)
    upload, created = await _uploads_call(
        runtime.restore.uploads.create,
        data.get("name"),
        data.get("size"),
        data.get("lastModified"),
        now_iso=iso_utc(runtime.clock.now()),
    )
    return JSONResponse(upload.to_json(), status_code=201 if created else 200, headers=NO_STORE)


@router.get("/uploads")
async def list_uploads(request: Request, admin: Admin) -> JSONResponse:
    uploads = await _uploads_call(get_runtime(request).restore.uploads.all)
    return JSONResponse({"uploads": [u.to_json() for u in uploads]}, headers=NO_STORE)


async def _read_chunk(request: Request) -> bytes:
    declared = request.headers.get("content-length")
    if declared is not None and (not declared.isdigit() or int(declared) > CHUNK_SIZE):
        raise ApiError(413, "too_large", f"A chunk is at most {CHUNK_SIZE} bytes")
    body = bytearray()
    async for piece in request.stream():
        body += piece
        if len(body) > CHUNK_SIZE:
            raise ApiError(413, "too_large", f"A chunk is at most {CHUNK_SIZE} bytes")
    return bytes(body)


@router.put("/uploads/{upload_id}/chunks/{n}", dependencies=CSRF)
async def put_chunk(request: Request, upload_id: str, n: str, admin: Admin) -> JSONResponse:
    runtime = get_runtime(request)
    if not n.isdigit() or len(n) > 6:
        raise ApiError(422, "invalid", "The chunk index must be a number")
    body = await _read_chunk(request)
    uploads = runtime.restore.uploads
    await _uploads_call(uploads.get, upload_id)  # 404 before anything else
    if await run_in_threadpool(_jobs_using, runtime, upload_id):
        raise ApiError(409, "busy", "A restore job uses this upload")
    upload = await _uploads_call(
        uploads.put_chunk, upload_id, int(n), body, request.headers.get("x-chunk-sha256")
    )
    return JSONResponse(
        {"uploadId": upload.id, "state": upload.state, "received": sorted(upload.received)}, headers=NO_STORE
    )


@router.get("/uploads/{upload_id}")
async def get_upload(request: Request, upload_id: str, admin: Admin) -> JSONResponse:
    upload = await _uploads_call(get_runtime(request).restore.uploads.get, upload_id)
    return JSONResponse(upload.to_json(), headers=NO_STORE)


@router.post("/uploads/{upload_id}/validate", dependencies=CSRF)
async def validate_upload(request: Request, upload_id: str, admin: Admin) -> JSONResponse:
    runtime = get_runtime(request)
    data = await _json(request)
    passphrase = data.get("passphrase")
    if passphrase is not None and (
        not isinstance(passphrase, str) or not 1 <= len(passphrase) <= MAX_PASSPHRASE
    ):
        raise ApiError(422, "invalid", f"The passphrase must be 1 to {MAX_PASSPHRASE} characters")
    await _uploads_call(runtime.restore.uploads.get, upload_id)
    if await run_in_threadpool(_jobs_using, runtime, upload_id):
        raise ApiError(409, "busy", "A restore job uses this upload")
    await _uploads_call(runtime.restore.validate_async, upload_id, passphrase or None)
    del passphrase, data  # the validation thread holds the only reference
    upload = await _uploads_call(runtime.restore.uploads.get, upload_id)
    return JSONResponse(upload.to_json(), status_code=202, headers=NO_STORE)


@router.delete("/uploads/{upload_id}", dependencies=CSRF)
async def delete_upload(request: Request, upload_id: str, admin: Admin) -> Response:
    runtime = get_runtime(request)
    upload = await _uploads_call(runtime.restore.uploads.get, upload_id)
    if upload.state == "validating":
        raise ApiError(409, "busy", "The upload is being validated")
    if await run_in_threadpool(_jobs_using, runtime, upload_id):
        raise ApiError(409, "busy", "A restore job uses this upload; cancel it first")
    await _uploads_call(runtime.restore.uploads.delete, upload_id)
    logger.info("Restore upload %s deleted by an admin", upload_id)
    return Response(status_code=204, headers=NO_STORE)


# -- jobs (called from POST /api/admin/jobs) ---------------------------------------------------------


def _run_at(value: Any, tz: str, now: datetime, quota_tz: str) -> datetime:
    if value == "now":
        return now
    if value == "tonight":
        return next_reset(now, tz)
    if value == "after_quota_reset":
        return next_reset(now, quota_tz) + RESUME_AFTER_RESET
    if not isinstance(value, str) or not value:
        raise ApiError(422, "invalid", 'runAt must be "now", "tonight", "after_quota_reset" or an ISO time')
    try:
        moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise ApiError(
            422, "invalid", 'runAt must be "now", "tonight", "after_quota_reset" or an ISO time'
        ) from None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=ZoneInfo(tz))
    return moment


def create_restore_job(runtime: Runtime, data: dict[str, Any], identity: Any, tz: str) -> dict[str, Any]:
    """Validate the request and store a `scheduled` restore job (thread: store calls)."""
    store = runtime.store
    mode = data.get("mode", "merge")
    if mode not in ("merge", "replace"):
        raise ApiError(422, "invalid", 'mode must be "merge" or "replace"')
    if mode == "replace" and store.kind == "firestore":
        raise ApiError(409, "unsupported", "Replace is not supported on Firestore; use merge")
    exit_after = data.get("exitMaintenanceOnSuccess", True)
    if not isinstance(exit_after, bool):
        raise ApiError(422, "invalid", "exitMaintenanceOnSuccess must be true or false")
    upload_id = data.get("uploadId")
    try:
        upload = runtime.restore.uploads.get(upload_id)
    except UploadError as exc:
        raise _error(exc) from None
    if upload.state != "validated" or upload.report is None:
        raise ApiError(409, "not_validated", "Validate the upload before restoring it")
    now = runtime.clock.now()
    run_at = _run_at(data.get("runAt", "now"), tz, now, runtime.settings.quota_tz)
    if run_at < now - timedelta(minutes=1) or run_at > now + timedelta(days=MAX_DAYS_AHEAD):
        raise ApiError(422, "invalid", f"runAt must be between now and {MAX_DAYS_AHEAD} days ahead")
    target_users = int((upload.report.get("target") or {}).get("users") or 0)
    require_destructive(runtime, identity, data, confirm_phrase(str(mode), target_users))
    active = [j for j in store.list_jobs(ACTIVE_RESTORE, limit=50) if j.get("kind") == "restore"]
    if active:
        raise ApiError(409, "busy", f"Restore job {active[0]['id']} is {active[0].get('state')}")
    report = upload.report
    job = {
        "id": new_job_id(runtime.clock.now_ms()),
        "kind": "restore",
        "state": "scheduled",
        "uploadId": upload.id,
        "fileName": upload.name,
        "mode": mode,
        "runAt": iso_utc(run_at),
        "tz": tz,
        "exitMaintenanceOnSuccess": exit_after,
        "total": int(report.get("records") or 0),
        "endCounts": report.get("counts"),
        "checkpoint": {"line": 0},
        "createdAt": run_at_ms_iso(now),
        "createdBy": getattr(identity, "email", None),
    }
    store.put_job(job)
    return job


def run_at_ms_iso(moment: datetime) -> str:
    return moment.strftime("%Y-%m-%dT%H:%M:%S.") + f"{moment.microsecond // 1000:03d}Z"
