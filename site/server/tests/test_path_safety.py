"""Path traversal and other hostile paths: always a 404 (or a redirect to a catalog path),
never a file from outside the allow-lists.

`asgi_get` sends paths exactly as uvicorn would hand them over (percent-decoded, with
`..` segments kept), because httpx would normalise them away before sending.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from tests.support import SECRET_TEXT, asgi_get

# Every one of these must answer 404 without leaking SECRET_TEXT or build internals.
HOSTILE_PATHS = [
    b"/_sh/../../secret.txt",
    b"/_sh/..%2f..%2fsecret.txt",
    b"/_sh/%2e%2e/%2e%2e/secret.txt",
    b"/_sh/%2e%2e%2f%2e%2e%2fsecret.txt",
    b"/_sh/..%5c..%5csecret.txt",
    b"/_sh/%252e%252e%252fsecret.txt",
    b"/_sh/../../../../../../etc/passwd",
    b"/_sh/bridge.js%00.txt",
    b"/_sh/./bridge.js",
    b"/_sh//etc/passwd",
    b"/_sh/../index.html",
    b"/assets/../../secret.txt",
    b"/assets/..%2f..%2fsecret.txt",
    b"/assets/%2e%2e%2f%2e%2e%2fsecret.txt",
    b"/assets/../index.html",
    b"/assets/./index-AbC123.js",
    b"/assets/fonts/../../../secret.txt",
    b"/assets//etc/passwd",
    b"/assets/%2fetc%2fpasswd",
    b"/h/..%2f..%2fsecret.txt",
    b"/h/../../secret.txt",
    b"/h/%2e%2e",
    b"/h/..",
    b"/h/.",
    b"/h/..%2fsecret.txt/download",
    b"/h/ai-103%2f..%2f..%2fcatalog.internal.json",
    b"/h/ai-103/../../catalog.internal.json",
    b"/h/ai-103/..%2foriginal.html",
    b"/h/ai-103%00",
    b"/h/%00/download",
    b"/../secret.txt",
    b"/..%2fsecret.txt",
    b"/catalog.internal.json",
    b"/catalog.json/../catalog.internal.json",
    b"/build-report.json",
    b"/.vite/manifest.json",
    b"/%2e%2e/%2e%2e/etc/passwd",
]


@pytest.mark.parametrize("raw_path", HOSTILE_PATHS, ids=lambda p: p.decode())
def test_hostile_paths_are_404(client: TestClient, secret_file: Path, raw_path: bytes) -> None:
    status, headers, body = asgi_get(client.app, raw_path)
    assert status == 404, (raw_path, status)
    assert SECRET_TEXT not in body
    assert b"root:" not in body
    assert b'"csp"' not in body  # catalog.internal.json never leaks
    assert headers["x-content-type-options"] == "nosniff"


def test_hostile_paths_through_http_client(client: TestClient, secret_file: Path) -> None:
    # The same idea via httpx (which normalises plain `..` but keeps encoded ones).
    for url in (
        "/_sh/..%2F..%2Fsecret.txt",
        "/assets/..%2F..%2Fsecret.txt",
        "/h/..%2F..%2Fsecret.txt",
        "/h/..%2F..%2Fsecret.txt/download",
        "/_sh/%2E%2E/%2E%2E/secret.txt",
    ):
        response = client.get(url)
        assert response.status_code == 404, url
        assert SECRET_TEXT not in response.content


def test_symlink_in_public_is_not_served(client: TestClient, public, secret_file: Path) -> None:
    (public.root / "_sh" / "leak.js").symlink_to(secret_file)
    (public.root / "assets" / "leak.js").symlink_to(secret_file)
    state = client.app.state.studyhubs  # type: ignore[attr-defined]
    state.public.sh._scanned_at -= 60  # allow the dev rescan
    state.public.assets._scanned_at -= 60
    for url in (b"/_sh/leak.js", b"/assets/leak.js"):
        status, _, body = asgi_get(client.app, url)
        assert status == 404
        assert SECRET_TEXT not in body


def test_redirect_never_points_off_site(client: TestClient) -> None:
    for url in ("/h/ai103?next=//evil.example", "/signin/?x=https://evil.example"):
        response = client.get(url)
        assert response.status_code == 301
        assert response.headers["location"].startswith(("/h/ai-103?", "/signin?"))


@pytest.mark.parametrize("query", [b"a=\xff\x00", b"a=1\n", b"a=1\r\nX-Evil: 1", b"a b"])
def test_query_with_raw_bytes_is_dropped_from_redirect(client: TestClient, query: bytes) -> None:
    status, headers, _ = asgi_get(client.app, b"/h/ai103", query=query)
    assert status == 301
    assert headers["location"] == "/h/ai-103"
    assert "x-evil" not in headers
