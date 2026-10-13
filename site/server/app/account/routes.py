"""The signed-in user's own data (build-contracts.md section 18).

    GET    /api/me/progress   {"hubs":[{"hub","slug","title","parts":{"<part>":{"upd","bytes"}},"done"}],
                               "joined": ISO | null}
    GET    /api/me/export     attachment studyhubs-export-<YYYYMMDD>.json (5/h)
    DELETE /api/me            {confirm:"DELETE"} + a sign-in within 24 h (3/h) -> 204

The listing and the export are one id-range query over the user's hub documents
(1 read per document); both add the user document (1 read: the listing's `joined`, the
account page's "Joined" date, is its `createdAt`). Deleting runs
steps that are each safe to repeat: progress docs, the user doc, the tombstone, the
Firebase Auth user, then the cookies.
"""

from __future__ import annotations

import json
import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from starlette.responses import Response

from app.admin.auth import CONFIRM_DELETE_ACCOUNT, require_destructive
from app.auth import ratelimit
from app.auth.csrf import csrf_protect
from app.auth.deps import Viewer, require_user
from app.auth.identity import AuthUnavailable
from app.auth.session import clear_session_cookies, session_cookie_name
from app.errors import ApiError
from app.progress.routes import maintenance_error, rate_limit
from app.progress.validate import decode_gz, loads, read_body
from app.quota.pacific import iso_utc
from app.runtime import Runtime, get_runtime
from app.state import get_state
from app.store.base import PARTS, QuotaExhausted, StoreError, UserRecord, tombstone_hash

logger = logging.getLogger(__name__)

NO_STORE = {"Cache-Control": "no-store"}
EXPORT_RULE = ratelimit.Rule("export", 5, 5 / 3600)
DELETE_RULE = ratelimit.Rule("delete-account", 3, 3 / 3600)
MAX_DELETE_BODY = 4096

router = APIRouter()
User = Annotated[Viewer, Depends(require_user)]


def store_error(exc: StoreError) -> ApiError:
    if isinstance(exc, QuotaExhausted):
        message = "The daily quota is used up; try again later"
        return ApiError(503, "unavailable", message, retry_at=exc.retry_at)
    return ApiError(503, "unavailable", "Your data is unavailable right now", retry_after=15)


async def _store_call(fn: Any, *args: Any, **kwargs: Any) -> Any:
    try:
        return await run_in_threadpool(fn, *args, **kwargs)
    except StoreError as exc:
        logger.warning("Account store call failed: %s", exc)
        raise store_error(exc) from None


def _no_full_maintenance(runtime: Runtime) -> None:
    if runtime.maintenance_mode == "full":
        raise maintenance_error(runtime)


@router.get("/api/me/progress")
async def my_progress(request: Request, viewer: User) -> JSONResponse:
    runtime = get_runtime(request)
    _no_full_maintenance(runtime)
    rate_limit(runtime, "uid:" + viewer.uid, ratelimit.PROGRESS)
    summaries = await _store_call(runtime.store.list_hubs, viewer.uid)
    record = await _store_call(runtime.store.get_user, viewer.uid)
    catalog = get_state(request).catalog
    hubs = []
    for summary in summaries:
        hub = catalog.by_id.get(summary.hub) if catalog is not None else None
        hubs.append(
            {
                "hub": summary.hub,
                "slug": hub.slug if hub is not None else None,
                "title": hub.title if hub is not None else None,
                "parts": {
                    part: {"upd": info.upd, "bytes": info.bytes}
                    for part, info in summary.parts.items()
                    if part in PARTS
                },
                "done": summary.done if summary.done is not None else 0,
            }
        )
    joined = iso_utc(record.created_at) if record is not None and record.created_at else None
    return JSONResponse({"hubs": hubs, "joined": joined}, headers=NO_STORE)


def _user_json(record: UserRecord | None, viewer: Viewer) -> dict[str, Any]:
    identity = viewer.identity
    assert identity is not None  # noqa: S101 - require_user guarantees it
    return {
        "publicId": viewer.public_id,
        "email": record.email if record else identity.email,
        "emailVerified": record.email_verified if record else identity.email_verified,
        "name": record.name if record else identity.name,
        "photo": record.photo if record else identity.photo,
        "provider": record.provider if record else identity.provider,
        "createdAt": iso_utc(record.created_at) if record and record.created_at else None,
        "lastLoginAt": iso_utc(record.last_login_at) if record and record.last_login_at else None,
    }


@router.get("/api/me/export")
async def export(request: Request, viewer: User) -> Response:
    runtime = get_runtime(request)
    _no_full_maintenance(runtime)
    rate_limit(runtime, "uid:" + viewer.uid, EXPORT_RULE)
    record = await _store_call(runtime.store.get_user, viewer.uid)
    summaries = await _store_call(runtime.store.list_hubs, viewer.uid, payloads=True)

    def build() -> bytes:
        progress = []
        for summary in summaries:
            for part in PARTS:
                info = summary.parts.get(part)
                if info is not None and info.gz is not None:
                    data = decode_gz(info.gz)
                    progress.append({"hub": summary.hub, "part": part, "upd": info.upd, "data": data})
        now = runtime.clock.now()
        body = {"exportedAt": iso_utc(now), "user": _user_json(record, viewer), "progress": progress}
        return json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")

    content = await run_in_threadpool(build)
    filename = f"studyhubs-export-{runtime.clock.now().strftime('%Y%m%d')}.json"
    return Response(
        content,
        media_type="application/json",
        headers={**NO_STORE, "Content-Disposition": f'attachment; filename="{filename}"'},
    )


def delete_account(runtime: Runtime, uid: str) -> None:
    """The deletion steps, in order; each one is safe to repeat after a failure."""
    runtime.store.delete_user(uid)  # 1 + 2: progress docs, then the user doc
    runtime.store.put_tombstone(tombstone_hash(uid), runtime.clock.now())  # 3
    runtime.auth.delete_user(uid)  # 4: the Firebase Auth user (fake mode: no-op)


@router.delete("/api/me", dependencies=[Depends(csrf_protect)])
async def delete_me(request: Request, viewer: User) -> Response:
    runtime = get_runtime(request)
    if runtime.maintenance_mode in ("read_only", "full"):
        raise maintenance_error(runtime)
    rate_limit(runtime, "uid:" + viewer.uid, DELETE_RULE)
    data = loads(await read_body(request, max_wire=MAX_DELETE_BODY, max_decompressed=MAX_DELETE_BODY))
    if not isinstance(data, dict):
        raise ApiError(422, "invalid", "Body must be a JSON object")
    identity = viewer.identity
    assert identity is not None  # noqa: S101 - require_user guarantees it
    require_destructive(runtime, identity, data, CONFIRM_DELETE_ACCOUNT)
    try:
        await run_in_threadpool(delete_account, runtime, viewer.uid)
    except StoreError as exc:
        logger.warning("Account deletion interrupted (safe to retry): %s", exc)
        raise store_error(exc) from None
    except AuthUnavailable:
        raise ApiError(503, "unavailable", "Deleting the sign-in failed; try again", retry_after=30) from None
    runtime.deleted_uids.add(viewer.uid)
    cookie = request.cookies.get(session_cookie_name(runtime.settings))
    if cookie:
        runtime.auth.forget(cookie)
    logger.info("Account deleted (tombstone %s)", tombstone_hash(viewer.uid)[:12])
    response = Response(status_code=204, headers=NO_STORE)
    clear_session_cookies(response, runtime.settings)
    return response
