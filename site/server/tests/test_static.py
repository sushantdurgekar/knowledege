"""/_sh/*, /assets/*, /robots.txt, top-level public files and the SPA fallback."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from tests.support import SHELL_HTML, FakePublic, fetch, quoted_sha

SH_CACHE = "public, max-age=600, stale-while-revalidate=86400"
SPA_ROUTES = [
    "/",
    "/signin",
    "/signup",
    "/reset",
    "/verify",
    "/signout",
    "/account",
    "/admin",
    "/admin/backup",
    "/admin/restore/step-2",
    "/privacy",
]


@pytest.mark.parametrize(
    ("accept_encoding", "suffix", "encoding"),
    [("br, gzip", ".br", "br"), ("gzip", ".gz", "gzip"), ("identity", "", None), (None, "", None)],
)
def test_bridge_js_precompressed(
    client: TestClient, public: FakePublic, accept_encoding: str | None, suffix: str, encoding: str | None
) -> None:
    response, raw = fetch(client, "/_sh/bridge.js", accept_encoding=accept_encoding)
    assert response.status_code == 200
    assert raw == public.read("_sh/bridge.js" + suffix)
    assert response.headers.get("content-encoding") == encoding
    assert response.headers["content-type"] == "text/javascript; charset=utf-8"
    assert response.headers["cache-control"] == SH_CACHE
    assert response.headers["vary"] == "Accept-Encoding"
    assert response.headers["etag"] == quoted_sha(raw)


def test_fflate_without_br_falls_back_to_gzip(client: TestClient, public: FakePublic) -> None:
    response, raw = fetch(client, "/_sh/fflate.js", accept_encoding="br, gzip")
    assert response.headers["content-encoding"] == "gzip"
    assert raw == public.read("_sh/fflate.js.gz")


def test_sh_304(client: TestClient) -> None:
    etag = fetch(client, "/_sh/bridge.js", accept_encoding="br")[0].headers["etag"]
    response, raw = fetch(client, "/_sh/bridge.js", accept_encoding="br", headers={"If-None-Match": etag})
    assert response.status_code == 304
    assert raw == b""
    assert response.headers["cache-control"] == SH_CACHE


@pytest.mark.parametrize("url", ["/_sh/nope.js", "/_sh/bridge.js.br", "/_sh/", "/_sh/x/bridge.js"])
def test_sh_unknown_is_plain_404(client: TestClient, url: str) -> None:
    response = client.get(url)
    assert response.status_code == 404
    assert response.headers["content-type"].startswith("text/plain")
    assert response.headers["cache-control"] == "no-store"


def test_assets_immutable(client: TestClient, public: FakePublic) -> None:
    for rel, media_type in [
        ("index-AbC123.js", "text/javascript; charset=utf-8"),
        ("index-AbC123.css", "text/css; charset=utf-8"),
        ("fonts/inter-AbC.woff2", "font/woff2"),
    ]:
        response, raw = fetch(client, f"/assets/{rel}")
        assert response.status_code == 200, rel
        assert raw == public.read(f"assets/{rel}")
        assert response.headers["cache-control"] == "public, max-age=31536000, immutable"
        assert response.headers["content-type"] == media_type


def test_assets_precompressed_sibling_used(client: TestClient, public: FakePublic) -> None:
    response, raw = fetch(client, "/assets/index-AbC123.js", accept_encoding="br")
    assert response.headers["content-encoding"] == "br"
    assert raw == public.read("assets/index-AbC123.js.br")


def test_assets_missing_is_404(client: TestClient) -> None:
    response = client.get("/assets/index-old999.js")
    assert response.status_code == 404
    assert response.headers["content-type"].startswith("text/plain")


def test_assets_added_after_start_are_found(client: TestClient, public: FakePublic) -> None:
    (public.root / "assets" / "index-New456.js").write_bytes(b"new()")
    # Dev servers rescan on a miss (rate-limited); force the interval to have passed.
    state = client.app.state.studyhubs  # type: ignore[attr-defined]
    state.public.assets._scanned_at -= 60
    response = client.get("/assets/index-New456.js")
    assert response.status_code == 200
    assert response.content == b"new()"


def test_robots_from_public(client: TestClient, public: FakePublic) -> None:
    response = client.get("/robots.txt")
    assert response.status_code == 200
    assert response.content == public.read("robots.txt")
    assert response.headers["content-type"] == "text/plain; charset=utf-8"


def test_robots_fallback_when_missing(make_client, public: FakePublic) -> None:
    (public.root / "robots.txt").unlink()
    response = make_client().get("/robots.txt")
    assert response.status_code == 200
    for line in ("Disallow: /api/", "Disallow: /h/*/download", "Disallow: /admin"):
        assert line in response.text


def test_favicon(client: TestClient, public: FakePublic) -> None:
    response = client.get("/favicon.svg")
    assert response.status_code == 200
    assert response.content == public.read("favicon.svg")
    assert response.headers["content-type"] == "image/svg+xml"
    assert response.headers["cache-control"] == "public, max-age=3600"


@pytest.mark.parametrize("url", SPA_ROUTES)
def test_spa_routes_200(client: TestClient, url: str) -> None:
    response, raw = fetch(client, url, accept_encoding="gzip, br")
    assert response.status_code == 200
    assert raw == SHELL_HTML  # no .gz sibling, and the /api gzip middleware stays out
    assert "content-encoding" not in response.headers
    assert response.headers["content-type"] == "text/html; charset=utf-8"
    assert response.headers["cache-control"] == "no-cache"
    assert response.headers["etag"] == quoted_sha(SHELL_HTML)
    assert response.headers["cross-origin-opener-policy"] == "same-origin-allow-popups"


def test_spa_304(client: TestClient) -> None:
    etag = client.get("/signin").headers["etag"]
    response = client.get("/account", headers={"If-None-Match": etag})
    assert response.status_code == 304
    assert response.headers["cache-control"] == "no-cache"


def test_spa_query_string_is_fine(client: TestClient) -> None:
    assert client.get("/signin?next=/h/ai-103").status_code == 200


@pytest.mark.parametrize(
    "url",
    [
        "/nope",
        "/h",
        "/index.html",
        "/docs",
        "/openapi.json",
        "/redoc",
        "/signin/extra",
        "/admins",
        "/catalog.internal.json",
        "/build-report.json",
        "/hubs/ai-103/index.html",
        "/.vite/manifest.json",
        "/assets",
        "/_sh",
        "/healthz/x",
    ],
)
def test_unknown_paths_get_shell_with_404(client: TestClient, url: str) -> None:
    response = client.get(url)
    assert response.status_code == 404
    assert response.content == SHELL_HTML
    assert response.headers["cache-control"] == "no-cache"
    assert response.headers["etag"] == quoted_sha(SHELL_HTML)


def test_unknown_path_ignores_if_none_match(client: TestClient) -> None:
    etag = client.get("/").headers["etag"]
    response = client.get("/nope", headers={"If-None-Match": etag})
    assert response.status_code == 404


@pytest.mark.parametrize(
    ("url", "location"),
    [
        ("/signin/", "/signin"),
        ("/admin/", "/admin"),
        ("/admin/backup/", "/admin/backup"),
        ("/privacy/?a=1", "/privacy?a=1"),
    ],
)
def test_spa_trailing_slash_redirect(client: TestClient, url: str, location: str) -> None:
    response = client.get(url)
    assert response.status_code == 301
    assert response.headers["location"] == location


@pytest.mark.parametrize("url", ["/admin/%E2%9C%93/", "/admin/x%0A/", "/admin/x%0D%0AX-Evil:%201/"])
def test_spa_trailing_slash_with_odd_characters_is_not_echoed(client: TestClient, url: str) -> None:
    response = client.get(url)
    assert response.status_code == 200  # still an admin route, served without a redirect
    assert "location" not in response.headers
    assert "x-evil" not in response.headers


def test_non_get_on_page_routes_is_405_json(client: TestClient) -> None:
    for method in ("POST", "PUT", "DELETE", "PATCH"):
        response = client.request(method, "/signin")
        assert response.status_code == 405
        assert response.json() == {"code": "method_not_allowed", "message": "Method Not Allowed"}
        assert response.headers["allow"] == "GET, HEAD"


def test_head_on_spa(client: TestClient) -> None:
    response, raw = fetch(client, "/", method="HEAD")
    assert response.status_code == 200
    assert raw == b""
    assert response.headers["content-length"] == str(len(SHELL_HTML))
