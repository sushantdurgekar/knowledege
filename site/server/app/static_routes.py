"""The React shell and everything else in PUBLIC_DIR (build-contracts.md section 5).

/_sh/{file}     bridge output (precompressed), short cache
/assets/{path}  Vite hashed files, cached for a year
/robots.txt     from PUBLIC_DIR, with a built-in fallback
/{file}         other top-level public files (favicon.svg, ...)
SPA routes      index.html, 200, no-cache
anything else   index.html with 404 (the SPA renders its NotFound page)
/api/*          unknown endpoints: JSON 404 in the standard error shape

The last four rows are `fallback_app`, which `create_app` installs as the router's
default: it only sees requests that matched no route at all. A request whose path
matches a route but whose method does not gets the router's own 405 first.
"""

from __future__ import annotations

import re

from fastapi import APIRouter, Request
from starlette.responses import PlainTextResponse, Response
from starlette.types import Receive, Scope, Send
from starlette.websockets import WebSocketClose

from app import pages
from app.errors import ApiError
from app.http_utils import permanent_redirect
from app.paths import is_api_path
from app.precompressed import AssetDirectory, asset_response
from app.state import PublicFiles, get_state

SH_CACHE = "public, max-age=600, stale-while-revalidate=86400"
ASSET_CACHE = "public, max-age=31536000, immutable"
SHELL_CACHE = "no-cache"
# The shell must never be framed (clickjacking on sign-in and account pages).
SHELL_FRAMING = {"X-Frame-Options": "DENY", "Content-Security-Policy": "frame-ancestors 'none'"}
ROOT_FILE_CACHE = "public, max-age=3600"
GET_HEAD = ["GET", "HEAD"]

SPA_ROUTES = frozenset(
    {"/", "/signin", "/signup", "/reset", "/verify", "/signout", "/account", "/admin", "/privacy"}
)
SPA_PREFIXES = ("/admin/",)
SHELL_INDEX = "index.html"
# Only plain paths are echoed back in a redirect Location.
_REDIRECTABLE_RE = re.compile(r"/[A-Za-z0-9._~/-]*")

DEFAULT_ROBOTS = "User-agent: *\nDisallow: /api/\nDisallow: /h/*/download\nDisallow: /admin\n"

router = APIRouter(include_in_schema=False)


def is_spa_route(path: str) -> bool:
    return path in SPA_ROUTES or (path.startswith(SPA_PREFIXES) and path not in SPA_PREFIXES)


def _public(request: Request) -> PublicFiles | None:
    return get_state(request).public


async def _serve_from(request: Request, directory: AssetDirectory | None, key: str, cache: str) -> Response:
    asset = directory.get(key) if directory is not None else None
    if asset is None:
        return pages.file_not_found()
    return await asset_response(request, asset, get_state(request).hasher, cache_control=cache)


@router.api_route("/_sh/{name:path}", methods=GET_HEAD)
async def bridge_files(request: Request, name: str) -> Response:
    public = _public(request)
    return await _serve_from(request, public.sh if public else None, name, SH_CACHE)


@router.api_route("/assets/{name:path}", methods=GET_HEAD)
async def vite_assets(request: Request, name: str) -> Response:
    public = _public(request)
    return await _serve_from(request, public.assets if public else None, name, ASSET_CACHE)


@router.api_route("/robots.txt", methods=GET_HEAD)
async def robots(request: Request) -> Response:
    public = _public(request)
    asset = public.root.get("robots.txt") if public else None
    if asset is None:
        return PlainTextResponse(DEFAULT_ROBOTS, headers={"Cache-Control": ROOT_FILE_CACHE})
    return await asset_response(request, asset, get_state(request).hasher, cache_control=ROOT_FILE_CACHE)


async def _shell(request: Request, status_code: int) -> Response:
    public = _public(request)
    index = public.root.get(SHELL_INDEX) if public else None
    if index is None:
        return pages.shell_unavailable()
    return await asset_response(
        request,
        index,
        get_state(request).hasher,
        cache_control=SHELL_CACHE,
        headers=SHELL_FRAMING,
        status_code=status_code,
    )


async def fallback(request: Request) -> Response:
    """Answer a request that matched no route (any method, any path)."""
    path: str = request.scope["path"]  # decoded; request.url.path would cut at a decoded "?"
    if is_api_path(path):
        raise ApiError(404, "not_found", "No such API endpoint")
    if request.method not in GET_HEAD:
        raise ApiError(405, "method_not_allowed", "Method Not Allowed", headers={"Allow": "GET, HEAD"})

    # Top-level public files (favicon.svg, ...): always a dotted name, unlike SPA routes.
    # index.html is only ever served as the shell.
    name = path[1:]
    public = _public(request)
    if public is not None and "." in name and "/" not in name and name != SHELL_INDEX:
        asset = public.root.get(name)
        if asset is not None:
            return await asset_response(
                request, asset, get_state(request).hasher, cache_control=ROOT_FILE_CACHE
            )

    canonical = path.rstrip("/")
    if (
        path != "/"
        and canonical != path
        and is_spa_route(canonical)
        and _REDIRECTABLE_RE.fullmatch(canonical)
    ):
        return permanent_redirect(request, canonical)  # e.g. /signin/ -> /signin
    return await _shell(request, 200 if is_spa_route(path) else 404)


async def fallback_app(scope: Scope, receive: Receive, send: Send) -> None:
    """ASGI form of `fallback`, for `app.router.default`."""
    if scope["type"] != "http":
        await WebSocketClose()(scope, receive, send)
        return
    response = await fallback(Request(scope, receive))
    await response(scope, receive, send)
