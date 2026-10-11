"""Hub pages, hub downloads and the public catalog (build-contracts.md section 5).

/h/{slug}            served variant (bridge injected), per-hub CSP, COOP same-origin
/h/{slug}/download   exact original bytes as an attachment, CSP sandbox
/catalog.json        public catalog for the React shell

Slugs are looked up in the catalog; nothing from the URL is joined onto a path.
"""

from __future__ import annotations

from fastapi import APIRouter, Request
from starlette.responses import Response

from app import pages
from app.catalog import Catalog, Hub
from app.errors import error_response
from app.http_utils import content_disposition, permanent_redirect
from app.precompressed import asset_response
from app.state import get_state

HUB_CACHE = "public, max-age=300, stale-while-revalidate=86400"
DOWNLOAD_CACHE = "public, max-age=3600"
CATALOG_CACHE = "max-age=300, stale-while-revalidate=86400"
DOWNLOAD_CSP = "sandbox"
GET_HEAD = ["GET", "HEAD"]

router = APIRouter(include_in_schema=False)


def _resolve(request: Request, slug: str, suffix: str = "") -> Hub | Response:
    """Return the hub for a canonical slug, or the response to send instead.

    Unknown → 404 page; build missing → 503 page; id / other letter case → 301 to
    `/h/<slug><suffix>` (built from catalog data only).
    """
    catalog: Catalog | None = get_state(request).catalog
    if catalog is None:
        return pages.hubs_unavailable()
    hub, canonical = catalog.lookup(slug)
    if hub is None:
        return pages.hub_not_found()
    if not canonical:
        return permanent_redirect(request, f"/h/{hub.slug}{suffix}")
    return hub


@router.api_route("/catalog.json", methods=GET_HEAD)
async def public_catalog(request: Request) -> Response:
    state = get_state(request)
    if state.catalog is None or state.catalog.public is None:
        return error_response(503, "unavailable", "The hub catalog is not available yet", retry_after=60)
    return await asset_response(request, state.catalog.public, state.hasher, cache_control=CATALOG_CACHE)


@router.api_route("/h/{slug}", methods=GET_HEAD)
async def hub_page(request: Request, slug: str) -> Response:
    hub = _resolve(request, slug)
    if isinstance(hub, Response):
        return hub
    return await asset_response(
        request,
        hub.served,
        get_state(request).hasher,
        cache_control=HUB_CACHE,
        headers={"Content-Security-Policy": hub.csp},
    )


@router.api_route("/h/{slug}/", methods=GET_HEAD)
async def hub_page_slash(request: Request, slug: str) -> Response:
    hub = _resolve(request, slug)
    return hub if isinstance(hub, Response) else permanent_redirect(request, f"/h/{hub.slug}")


@router.api_route("/h/{slug}/download", methods=GET_HEAD)
async def hub_download(request: Request, slug: str) -> Response:
    hub = _resolve(request, slug, "/download")
    if isinstance(hub, Response):
        return hub
    return await asset_response(
        request,
        hub.original,
        get_state(request).hasher,
        cache_control=DOWNLOAD_CACHE,
        headers={
            "Content-Disposition": content_disposition(hub.download_name),
            # If the file is ever rendered instead of saved, none of its scripts run.
            "Content-Security-Policy": DOWNLOAD_CSP,
        },
    )


@router.api_route("/h/{slug}/download/", methods=GET_HEAD)
async def hub_download_slash(request: Request, slug: str) -> Response:
    hub = _resolve(request, slug, "/download")
    return hub if isinstance(hub, Response) else permanent_redirect(request, f"/h/{hub.slug}/download")


@router.api_route("/h/{rest:path}", methods=GET_HEAD)
async def hub_other(request: Request) -> Response:
    """Anything else under /h/ (extra segments, encoded slashes, `..`): the hub 404 page."""
    if get_state(request).catalog is None:
        return pages.hubs_unavailable()
    return pages.hub_not_found()
