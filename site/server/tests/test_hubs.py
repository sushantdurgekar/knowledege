"""/h/{slug}, /h/{slug}/download and /catalog.json."""

from __future__ import annotations

import gzip

import pytest
from fastapi.testclient import TestClient

from tests.support import HUB_SPECS, FakeBuild, fetch, quoted_sha, sha256_hex

HUB_CACHE = "public, max-age=300, stale-while-revalidate=86400"
SLUGS = [spec["slug"] for spec in HUB_SPECS]
VARIANT = {"br": "index.html.br", "gzip": "index.html.gz", "identity": "index.html"}


# ---------------------------------------------------------------- hub page + negotiation


@pytest.mark.parametrize(
    ("accept_encoding", "encoding"),
    [
        ("gzip, deflate, br, zstd", "br"),
        ("gzip, deflate", "gzip"),
        ("br;q=0, gzip;q=1", "gzip"),
        ("identity", "identity"),
        ("deflate", "identity"),
        ("*;q=0", "identity"),
        (None, "identity"),
        ("*", "br"),
    ],
)
def test_hub_negotiation(
    client: TestClient, build: FakeBuild, accept_encoding: str | None, encoding: str
) -> None:
    response, raw = fetch(client, "/h/ai-103", accept_encoding=accept_encoding)
    assert response.status_code == 200
    expected = build.hub_file("ai-103", VARIANT[encoding])
    assert raw == expected  # exact precompressed bytes, never re-compressed
    assert response.headers.get("content-encoding") == (None if encoding == "identity" else encoding)
    assert response.headers["content-type"] == "text/html; charset=utf-8"
    assert response.headers["content-length"] == str(len(expected))
    assert response.headers["vary"] == "Accept-Encoding"
    assert response.headers["cache-control"] == HUB_CACHE
    assert response.headers["etag"] == quoted_sha(expected)  # strong, per encoding


def test_hub_variants_have_distinct_etags(client: TestClient) -> None:
    etags = {
        fetch(client, "/h/ai-103", accept_encoding=ae)[0].headers["etag"] for ae in ("br", "gzip", "identity")
    }
    assert len(etags) == 3
    assert all(not etag.startswith("W/") for etag in etags)


def test_gzip_variant_decodes_to_served_html(client: TestClient, build: FakeBuild) -> None:
    _, raw = fetch(client, "/h/ai-103", accept_encoding="gzip")
    served = gzip.decompress(raw)
    assert served == build.hub_file("ai-103", "index.html")
    assert b'<script src="/_sh/bridge.js" data-hub-id="ai103"' in served


@pytest.mark.parametrize("slug", SLUGS)
def test_hub_csp_equals_catalog_value(client: TestClient, build: FakeBuild, slug: str) -> None:
    response = client.get(f"/h/{slug}")
    assert response.status_code == 200
    assert response.headers["content-security-policy"] == build.entries[slug]["csp"]
    assert response.headers["cross-origin-opener-policy"] == "same-origin"


@pytest.mark.parametrize("encoding", ["br", "gzip", "identity"])
def test_hub_304_on_matching_etag(client: TestClient, build: FakeBuild, encoding: str) -> None:
    first, _ = fetch(client, "/h/ai-103", accept_encoding=encoding)
    etag = first.headers["etag"]
    for header in (etag, f"W/{etag}", f'"nope", {etag}', "*"):
        response, raw = fetch(
            client, "/h/ai-103", accept_encoding=encoding, headers={"If-None-Match": header}
        )
        assert response.status_code == 304, header
        assert raw == b""
        assert response.headers["etag"] == etag
        assert response.headers["vary"] == "Accept-Encoding"
        assert response.headers["cache-control"] == HUB_CACHE
        assert response.headers["content-security-policy"] == build.entries["ai-103"]["csp"]
        assert "content-encoding" not in response.headers
        assert "content-length" not in response.headers or response.headers["content-length"] == "0"


def test_hub_etag_of_other_encoding_does_not_match(client: TestClient) -> None:
    gzip_etag = fetch(client, "/h/ai-103", accept_encoding="gzip")[0].headers["etag"]
    response, raw = fetch(client, "/h/ai-103", accept_encoding="br", headers={"If-None-Match": gzip_etag})
    assert response.status_code == 200
    assert response.headers["content-encoding"] == "br"
    assert raw


def test_hub_stale_etag_gets_200(client: TestClient) -> None:
    response, _ = fetch(client, "/h/ai-103", headers={"If-None-Match": '"stale"'})
    assert response.status_code == 200


def test_hub_head(client: TestClient, build: FakeBuild) -> None:
    response, raw = fetch(client, "/h/ai-103", method="HEAD", accept_encoding="br")
    assert response.status_code == 200
    assert raw == b""
    assert response.headers["content-length"] == str(len(build.hub_file("ai-103", "index.html.br")))
    assert response.headers["content-encoding"] == "br"


def test_hub_picks_up_rebuilt_file(client: TestClient, build: FakeBuild) -> None:
    before = fetch(client, "/h/ai-103")[0].headers["etag"]
    path = build.root / "hubs" / "ai-103" / "index.html"
    path.write_bytes(path.read_bytes() + b"<!-- rebuilt -->")
    response, raw = fetch(client, "/h/ai-103")
    assert raw.endswith(b"<!-- rebuilt -->")
    assert response.headers["etag"] == quoted_sha(raw) != before


# ---------------------------------------------------------------- redirects and 404


@pytest.mark.parametrize(
    ("url", "location"),
    [
        ("/h/ai-103/", "/h/ai-103"),
        ("/h/ai103", "/h/ai-103"),
        ("/h/ai103/", "/h/ai-103"),
        ("/h/AI-103", "/h/ai-103"),
        ("/h/AI103", "/h/ai-103"),
        ("/h/dsa-l1", "/h/dsa-l1-foundation"),
        ("/h/ai103/download", "/h/ai-103/download"),
        ("/h/ai-103/download/", "/h/ai-103/download"),
        ("/h/ai103/download/", "/h/ai-103/download"),
        ("/h/ai-103/?tab=quiz", "/h/ai-103?tab=quiz"),
        ("/h/ai103?x=1&y=%20", "/h/ai-103?x=1&y=%20"),
    ],
)
def test_hub_redirects(client: TestClient, url: str, location: str) -> None:
    response = client.get(url)
    assert response.status_code == 301
    assert response.headers["location"] == location
    assert response.headers["cache-control"] == "public, max-age=3600"


@pytest.mark.parametrize(
    "url",
    [
        "/h/nope",
        "/h/nope/",
        "/h/nope/download",
        "/h/ai-103/extra",
        "/h/ai-103/download/extra",
        "/h/ai-103/index.html",
        "/h/ai-103/original.html",
        "/h/ai-103/index.html.br",
        "/h/",
        "/h/admin",
        "/h/%E2%9C%93",
    ],
)
def test_hub_404_page(client: TestClient, url: str) -> None:
    response = client.get(url)
    assert response.status_code == 404
    assert response.headers["content-type"] == "text/html; charset=utf-8"
    assert "Hub not found" in response.text
    assert 'href="/"' in response.text
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["content-security-policy"].startswith("default-src 'none'")
    assert "<script" not in response.text


def test_hub_404_does_not_echo_input(client: TestClient) -> None:
    response = client.get("/h/%3Cscript%3Ealert(1)%3C%2Fscript%3E")
    assert response.status_code == 404
    assert "alert(1)" not in response.text


def test_hub_rejects_other_methods(client: TestClient) -> None:
    response = client.post("/h/ai-103")
    assert response.status_code == 405
    assert response.json()["code"] == "method_not_allowed"
    assert set(response.headers["allow"].split(", ")) == {"GET", "HEAD"}


# ---------------------------------------------------------------- download


@pytest.mark.parametrize("encoding", ["br", "gzip", "identity"])
def test_download(client: TestClient, build: FakeBuild, encoding: str) -> None:
    response, raw = fetch(client, "/h/ai-103/download", accept_encoding=encoding)
    assert response.status_code == 200
    expected = build.hub_file(
        "ai-103", "original.html" + {"br": ".br", "gzip": ".gz", "identity": ""}[encoding]
    )
    assert raw == expected
    assert response.headers["content-disposition"] == (
        "attachment; filename=\"AI-103 Study Hub.html\"; filename*=UTF-8''AI-103%20Study%20Hub.html"
    )
    assert response.headers["content-security-policy"] == "sandbox"
    assert response.headers["cache-control"] == "public, max-age=3600"
    assert response.headers["content-type"] == "text/html; charset=utf-8"
    assert response.headers["etag"] == quoted_sha(expected)
    assert response.headers["cross-origin-opener-policy"] == "same-origin"


def test_download_is_the_exact_original(client: TestClient, build: FakeBuild) -> None:
    response, raw = fetch(client, "/h/ai-901/download")
    assert raw == build.hub_file("ai-901", "original.html")
    # The identity ETag is the catalog sha256 of the original bytes.
    assert response.headers["etag"] == f'"{build.entries["ai-901"]["sha256"]}"'
    assert sha256_hex(raw) == build.entries["ai-901"]["sha256"]
    assert b"/_sh/bridge.js" not in raw
    assert b"/api/seed/" not in raw


def test_download_non_ascii_filename(client: TestClient) -> None:
    response = client.get("/h/dsa-l1-foundation/download")
    assert response.status_code == 200
    assert response.headers["content-disposition"] == (
        'attachment; filename="Donnees _ Hub u _q_ 100_.html"; '
        "filename*=UTF-8''Donn%C3%A9es%20%E2%80%93%20Hub%20%C3%BC%20%22q%22%20100%25.html"
    )


def test_download_304(client: TestClient) -> None:
    etag = fetch(client, "/h/ai-103/download")[0].headers["etag"]
    response, raw = fetch(client, "/h/ai-103/download", headers={"If-None-Match": etag})
    assert response.status_code == 304
    assert raw == b""
    assert response.headers["content-security-policy"] == "sandbox"


def test_download_range(client: TestClient, build: FakeBuild) -> None:
    response, raw = fetch(client, "/h/ai-103/download", headers={"Range": "bytes=0-9"})
    assert response.status_code == 206
    assert raw == build.hub_file("ai-103", "original.html")[:10]


# ---------------------------------------------------------------- catalog.json


@pytest.mark.parametrize(("encoding", "suffix"), [("br", ".br"), ("gzip", ".gz"), ("identity", "")])
def test_catalog_json(client: TestClient, build: FakeBuild, encoding: str, suffix: str) -> None:
    response, raw = fetch(client, "/catalog.json", accept_encoding=encoding)
    assert response.status_code == 200
    assert raw == (build.root / f"catalog.json{suffix}").read_bytes()
    assert response.headers["content-type"] == "application/json"
    assert response.headers["cache-control"] == "max-age=300, stale-while-revalidate=86400"
    assert response.headers["vary"] == "Accept-Encoding"
    assert response.headers["etag"] == quoted_sha(raw)
    assert response.headers["cross-origin-opener-policy"] == "same-origin-allow-popups"


def test_catalog_json_304(client: TestClient) -> None:
    etag = client.get("/catalog.json", headers={"Accept-Encoding": "br"}).headers["etag"]
    response = client.get("/catalog.json", headers={"Accept-Encoding": "br", "If-None-Match": etag})
    assert response.status_code == 304


def test_catalog_json_has_no_internal_fields(client: TestClient) -> None:
    hubs = client.get("/catalog.json", headers={"Accept-Encoding": "identity"}).json()["hubs"]
    assert {hub["slug"] for hub in hubs} == set(SLUGS)
    assert all("csp" not in hub and "source" not in hub for hub in hubs)
