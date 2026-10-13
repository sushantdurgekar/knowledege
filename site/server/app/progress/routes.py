"""GET /api/progress/{hubId} and POST /api/sync (build-contracts.md section 10)."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from app.auth import ratelimit
from app.auth.csrf import csrf_protect
from app.auth.deps import get_viewer, require_user
from app.errors import ApiError
from app.progress.validate import (
    HubBatch,
    Limits,
    decode_body,
    loads,
    parse_known,
    parse_sync,
    parts_for,
    read_wire_body,
    syncable_hub,
)
from app.runtime import Runtime, get_runtime
from app.state import get_state

NO_STORE = {"Cache-Control": "no-store"}
# The publicId of the account a hub page belongs to (the bridge sends it with every request).
ACCOUNT_HEADER = "x-studyhubs-account"

router = APIRouter()


def maintenance_error(runtime: Runtime) -> ApiError:
    return ApiError(
        503,
        "maintenance",
        runtime.maintenance()["message"] or "Maintenance in progress",
        retry_after=300,
    )


def check_account(request: Request, public_id: str | None) -> None:
    """409 `account_changed` when the page says it belongs to another account than the session.

    A hub page keeps the account it booted with. If another account signs in on this browser
    (another tab), the page's in-memory progress must never be written under, or mixed with,
    the new account's: the cookie alone cannot tell, the page's claim can. Requests without
    the header (the site shell's reconcile) are not affected.
    """
    claimed = request.headers.get(ACCOUNT_HEADER)
    if claimed is not None and claimed != public_id:
        raise ApiError(409, "account_changed", "This page belongs to another account; reload it")


def rate_limit(runtime: Runtime, key: str, *rules: ratelimit.Rule) -> None:
    wait = runtime.limiter.hit(key, *rules)
    if wait is not None:
        now = runtime.clock.now()
        raise ApiError(
            429,
            "rate_limited",
            "Too many requests, try again shortly",
            retry_after=wait,
            retry_at=now + timedelta(seconds=wait),
            now=now,
        )


def injected_fault(runtime: Runtime, op: str) -> None:
    """Test-only failures queued by POST /api/test/faults (never set outside APP_ENV=test)."""
    fault = runtime.faults.take(op)
    if fault is None:
        return
    now = runtime.clock.now()
    retry_at = now + timedelta(seconds=fault.retry_after) if fault.retry_after is not None else None
    raise ApiError(
        fault.status,
        fault.code,
        "Injected test fault",
        retry_after=fault.retry_after,
        retry_at=retry_at,
        now=now,
    )


@router.get("/api/progress/{hub_id}")
async def get_progress(request: Request, hub_id: str, known: str | None = None) -> JSONResponse:
    runtime = get_runtime(request)
    hub = syncable_hub(get_state(request).catalog, hub_id)
    viewer = await get_viewer(request)
    if viewer.identity is None:
        return JSONResponse({"signedIn": False}, headers=NO_STORE)
    check_account(request, viewer.public_id)
    if runtime.maintenance_mode == "full":
        raise maintenance_error(runtime)
    uid = viewer.identity.uid
    rate_limit(runtime, "uid:" + uid, ratelimit.PROGRESS)
    injected_fault(runtime, "get")
    blocked_until = runtime.guard.read_block()
    if blocked_until is not None:
        raise ApiError(
            503,
            "unavailable",
            "Sync is paused until the quota resets",
            retry_at=blocked_until,
            now=runtime.clock.now(),
        )
    known_map = parse_known(known, parts_for(hub))
    parts = await run_in_threadpool(runtime.progress.get_parts, uid, hub, known_map)
    body: dict[str, Any] = {
        "signedIn": True,
        "hub": hub.id,
        "user": {"publicId": viewer.public_id},
        "parts": parts,
        "policy": runtime.guard.policy(uid).to_json(),
        "maintenance": runtime.maintenance(),
    }
    upcoming = runtime.upcoming()
    if upcoming is not None:  # a maintenance window starts within 10 minutes
        body["upcoming"] = upcoming
    return JSONResponse(body, headers=NO_STORE)


@router.post("/api/sync", dependencies=[Depends(csrf_protect)])
async def sync(request: Request) -> JSONResponse:
    runtime = get_runtime(request)
    settings = runtime.settings
    viewer = await require_user(request)
    check_account(request, viewer.public_id)
    if runtime.maintenance_mode in ("read_only", "full"):
        raise maintenance_error(runtime)
    uid = viewer.uid
    rate_limit(runtime, "uid:" + uid, ratelimit.SYNC)
    injected_fault(runtime, "put")
    paused_until = runtime.guard.sync_block(uid)
    if paused_until is not None:
        raise ApiError(
            429,
            "sync_paused",
            "Sync is paused until the daily quota resets; progress stays in this browser",
            retry_at=paused_until,
            now=runtime.clock.now(),
        )
    raw = await read_wire_body(request, max_wire=settings.max_body)
    encoding = request.headers.get("content-encoding")
    now_ms = runtime.clock.now_ms()
    limits = Limits(
        now_ms=now_ms,
        clock_skew_ms=settings.clock_skew_ms,
        max_part_gz=settings.max_part_gz,
        max_doc_gz=settings.max_doc_gz,
    )
    catalog = get_state(request).catalog

    def prepare() -> list[HubBatch]:
        # Inflating, parsing and gzipping up to 8 MiB is CPU work: keep it off the event loop.
        data = loads(decode_body(raw, encoding, max_decompressed=settings.max_body_decompressed))
        return parse_sync(data, catalog, limits)

    batches = await run_in_threadpool(prepare)
    results = await run_in_threadpool(runtime.progress.sync, uid, batches, now_ms)
    body: dict[str, Any] = {"results": results, "policy": runtime.guard.policy(uid).to_json()}
    upcoming = runtime.upcoming()
    if upcoming is not None:
        body["upcoming"] = upcoming
    return JSONResponse(body, headers=NO_STORE)
