"""One JSON error shape for the whole API: {"code", "message", "retryAfter"?}.

Raise `ApiError` from any route. Framework errors (404/405 from routing, request
validation, unhandled exceptions) are mapped onto the same shape here, so clients
only ever parse one format. `Retry-After` is sent whenever `retryAfter` is.
"""

from __future__ import annotations

import http
from collections.abc import Mapping
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

NO_STORE = "no-store"

# Machine-readable codes for framework-raised statuses. Routes pick their own codes
# (for example "email_unverified" or "sync_paused" in M1) through ApiError.
STATUS_CODES: Mapping[int, str] = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    413: "too_large",
    415: "unsupported_media_type",
    422: "invalid",
    429: "rate_limited",
    500: "internal",
    503: "unavailable",
}


class ApiError(Exception):
    """An error the API reports to the client in the standard shape."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        *,
        retry_after: int | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.retry_after = retry_after
        self.headers = dict(headers or {})


def error_response(
    status_code: int,
    code: str,
    message: str,
    *,
    retry_after: int | None = None,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    body: dict[str, Any] = {"code": code, "message": message}
    response_headers = {"Cache-Control": NO_STORE, **(headers or {})}
    if retry_after is not None:
        body["retryAfter"] = int(retry_after)
        response_headers["Retry-After"] = str(int(retry_after))
    return JSONResponse(body, status_code=status_code, headers=response_headers)


def _reason(status_code: int) -> str:
    try:
        return http.HTTPStatus(status_code).phrase
    except ValueError:
        return "Error"


async def _handle_api_error(_request: Request, exc: ApiError) -> JSONResponse:
    return error_response(
        exc.status_code, exc.code, exc.message, retry_after=exc.retry_after, headers=exc.headers
    )


async def _handle_http_exception(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
    status_code = exc.status_code
    message = exc.detail if isinstance(exc.detail, str) and exc.detail else _reason(status_code)
    code = STATUS_CODES.get(status_code, "error")
    return error_response(status_code, code, message, headers=exc.headers)


async def _handle_validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
    # Name the first offending field but never echo the submitted value back.
    message = "Invalid request"
    errors = exc.errors()
    if errors:
        first = errors[0]
        location = ".".join(str(part) for part in first.get("loc", ()))
        message = f"Invalid request: {location}: {first.get('msg', 'invalid value')}"
    return error_response(422, "invalid", message)


async def _handle_unexpected(_request: Request, _exc: Exception) -> JSONResponse:
    # Starlette's ServerErrorMiddleware sends this response and then re-raises,
    # so uvicorn still logs the traceback. Nothing internal leaks to the client.
    return error_response(500, "internal", "Internal server error")


def install_error_handlers(app: FastAPI) -> None:
    # Starlette dispatches by exception class, so each handler receives its own type.
    app.add_exception_handler(ApiError, _handle_api_error)  # type: ignore[arg-type]
    app.add_exception_handler(StarletteHTTPException, _handle_http_exception)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, _handle_validation_error)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, _handle_unexpected)
