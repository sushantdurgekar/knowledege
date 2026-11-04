"""Test-only routes (build-contracts.md section 15). `create_app` mounts this router only
when APP_ENV=test; a unit test asserts it is absent otherwise.

    POST /api/test/faults  {op:"get"|"put"|"any", status, code, retryAfter?, count?}
    POST /api/test/clock   {offsetMs}
    POST /api/test/quota   {writes?, reads?}
    POST /api/test/reset
    GET  /api/test/store
    POST /api/test/tick    (M2) run one scheduler tick now -> {events, maintenance, upcoming}

`reset` and `store` work on the memory store and on the Firestore emulator (so the M1
e2e specs also run with STORE=firestore); any other store answers 501.

Every route requires `X-StudyHubs: 1`. The Origin rule is relaxed for these routes
only: a test runner's request context sends no Origin, so a missing Origin is
accepted, but a present one must still equal PUBLIC_ORIGIN.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from starlette.responses import Response

from app.auth.csrf import PROTOCOL_HEADER, PROTOCOL_VERSION
from app.errors import ApiError
from app.progress.validate import decode_gz, loads, read_body
from app.runtime import Fault, Runtime, get_runtime
from app.store.base import USAGE_COUNTERS, StoreError

MAX_BODY = 16 * 1024
FAULT_OPS = ("get", "put", "any")


async def require_test_header(request: Request) -> None:
    if request.headers.get(PROTOCOL_HEADER) != PROTOCOL_VERSION:
        raise ApiError(403, "csrf", "Test routes require X-StudyHubs: 1")
    origin = request.headers.get("origin")
    if origin is not None and origin != get_runtime(request).settings.public_origin:
        raise ApiError(403, "csrf", "Cross-origin request")


router = APIRouter(prefix="/api/test", dependencies=[Depends(require_test_header)])


async def _json(request: Request) -> dict[str, Any]:
    raw = await read_body(request, max_wire=MAX_BODY, max_decompressed=MAX_BODY)
    data = loads(raw) if raw.strip() else {}
    if not isinstance(data, dict):
        raise ApiError(422, "invalid", "Body must be a JSON object")
    return data


def _int(data: dict[str, Any], name: str, *, default: int | None = None, low: int = 0) -> int | None:
    value = data.get(name, default)
    if value is None:
        return None
    if not isinstance(value, int) or isinstance(value, bool) or value < low:
        raise ApiError(422, "invalid", f"{name} must be an integer >= {low}")
    return value


@router.post("/faults")
async def faults(request: Request) -> JSONResponse:
    data = await _json(request)
    op = data.get("op")
    status = _int(data, "status", low=400)
    code = data.get("code")
    if op not in FAULT_OPS or status is None or status > 599 or not isinstance(code, str) or not code:
        raise ApiError(422, "invalid", 'Expected {op:"get"|"put"|"any", status:4xx|5xx, code}')
    count = _int(data, "count", default=1, low=1) or 1
    runtime = get_runtime(request)
    runtime.faults.add(Fault(op, status, code, _int(data, "retryAfter")), count)
    return JSONResponse({"ok": True, "pending": len(runtime.faults)})


@router.post("/clock")
async def clock(request: Request) -> JSONResponse:
    data = await _json(request)
    offset = data.get("offsetMs")
    if not isinstance(offset, int) or isinstance(offset, bool):
        raise ApiError(422, "invalid", "offsetMs must be an integer")
    runtime = get_runtime(request)
    runtime.clock.offset_ms = offset
    return JSONResponse({"ok": True, "offsetMs": offset, "nowMs": runtime.clock.now_ms()})


@router.post("/quota")
async def quota(request: Request) -> JSONResponse:
    data = await _json(request)
    values = {name: _int(data, name) for name in ("writes", "reads")}
    runtime = get_runtime(request)
    runtime.meter.set_today(**{k: v for k, v in values.items() if v is not None})
    return JSONResponse(
        {"ok": True, "today": runtime.meter.today(), "policy": runtime.guard.policy().to_json()}
    )


def reset_runtime(runtime: Runtime) -> None:
    reset = getattr(runtime.store, "reset", None)
    if callable(reset):
        reset()
    runtime.meter.reset()
    runtime.guard.reset()
    runtime.limiter.reset()
    runtime.faults.clear()
    runtime.auth.clear_cache()
    runtime.clock.offset_ms = 0
    runtime.site.reset()
    runtime.deleted_uids.clear()
    if runtime.scheduler is not None:
        runtime.scheduler.reset()
    if runtime.backups is not None:
        runtime.backups.reset()
    if runtime.restore is not None:
        runtime.restore.reset()


def _not_supported(exc: StoreError) -> ApiError:
    return ApiError(501, "not_supported", f"This store cannot do that here: {exc}")


@router.post("/reset")
async def reset(request: Request) -> Response:
    try:
        await run_in_threadpool(reset_runtime, get_runtime(request))
    except StoreError as exc:  # e.g. a real Firestore project: only the emulator is wiped
        raise _not_supported(exc) from None
    return Response(status_code=204)


@router.get("/store")
async def store(request: Request) -> JSONResponse:
    runtime = get_runtime(request)
    dump = getattr(runtime.store, "dump", None)
    if not callable(dump):
        raise ApiError(501, "not_supported", "This store cannot be dumped")
    try:
        body = await run_in_threadpool(dump, decode_gz)
    except StoreError as exc:
        raise _not_supported(exc) from None
    body["meter"] = {name: runtime.meter.today()[name] for name in USAGE_COUNTERS}
    return JSONResponse(body)


@router.post("/tick")
async def tick(request: Request) -> JSONResponse:
    """Run the job scheduler now (e2e: a window with a near startAt, after POST /clock)."""
    runtime = get_runtime(request)
    try:
        events = await run_in_threadpool(runtime.scheduler.tick)
    except StoreError as exc:
        raise _not_supported(exc) from None
    return JSONResponse(
        {"events": events, "maintenance": runtime.maintenance(), "upcoming": runtime.upcoming()}
    )
