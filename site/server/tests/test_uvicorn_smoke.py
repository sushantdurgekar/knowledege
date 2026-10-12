"""End-to-end smoke test through a real uvicorn process (httptools + uvloop).

Runs the same command line as the Dockerfile CMD against a fake build, and sends
raw request targets with http.client, which (unlike httpx) does not normalise `..`.
"""

from __future__ import annotations

import http.client
import os
import socket
import subprocess
import sys
import time
from collections.abc import Iterator
from pathlib import Path

import pytest

from tests.support import PROD_ENV, SECRET_TEXT, FakeBuild, FakePublic

SERVER_DIR = Path(__file__).resolve().parents[1]


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@pytest.fixture
def server(build: FakeBuild, public: FakePublic, secret_file: Path, tmp_path: Path) -> Iterator[int]:
    port = _free_port()
    env = {
        **os.environ,
        "APP_ENV": "production",
        "PUBLIC_ORIGIN": "https://study-hubs.example",
        "PUBLIC_DIR": str(public.root),
        "HUBS_DIR": str(build.root),
        "RENDER_GIT_COMMIT": "smoke42",
        "PORT": str(port),
        **PROD_ENV,  # M1: production refuses to start without these
    }
    for name in ("FIRESTORE_EMULATOR_HOST", "GOOGLE_APPLICATION_CREDENTIALS", "STORE", "AUTH_MODE"):
        env.pop(name, None)
    command = [
        sys.executable, "-m", "uvicorn", "app.main:app",
        "--host", "127.0.0.1", "--port", str(port), "--workers", "1",
        "--no-server-header",
    ]  # fmt: skip
    log_path = tmp_path / "uvicorn.txt"
    with log_path.open("wb") as log:
        process = subprocess.Popen(command, cwd=SERVER_DIR, env=env, stdout=log, stderr=log)  # noqa: S603
        try:
            _wait_until_up(process, port, log_path)
            yield port
        finally:
            process.terminate()
            process.wait(timeout=10)


def _wait_until_up(process: subprocess.Popen[bytes], port: int, log_path: Path) -> None:
    deadline = time.monotonic() + 15
    while True:
        try:
            if _request(port, "GET", "/healthz")[0] == 200:
                return
        except OSError:
            pass
        if process.poll() is not None or time.monotonic() > deadline:
            pytest.fail(f"uvicorn did not start:\n{log_path.read_text(errors='replace')}")
        time.sleep(0.1)


def _request(
    port: int, method: str, target: str, headers: dict[str, str] | None = None
) -> tuple[int, dict[str, str], bytes]:
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    try:
        conn.request(method, target, headers=headers or {})
        response = conn.getresponse()
        return response.status, {k.lower(): v for k, v in response.getheaders()}, response.read()
    finally:
        conn.close()


def test_real_server(server: int, build: FakeBuild) -> None:
    status, headers, body = _request(server, "GET", "/h/ai-103", {"Accept-Encoding": "gzip, deflate, br"})
    assert status == 200
    assert headers["content-encoding"] == "br"
    assert body == build.hub_file("ai-103", "index.html.br")
    assert headers["content-security-policy"] == build.entries["ai-103"]["csp"]
    assert headers["strict-transport-security"] == "max-age=31536000"
    assert "server" not in headers  # --no-server-header

    status, _, body = _request(
        server, "GET", "/h/ai-103", {"If-None-Match": headers["etag"], "Accept-Encoding": "br"}
    )
    assert (status, body) == (304, b"")

    status, headers, body = _request(server, "HEAD", "/healthz")
    assert status == 200
    assert body == b""

    status, _, body = _request(server, "GET", "/api/version")
    assert body == b'{"version":"0.1.0","commit":"smoke42"}'


@pytest.mark.parametrize(
    "target",
    [
        "/_sh/../../secret.txt",
        "/_sh/..%2f..%2fsecret.txt",
        "/_sh/%2e%2e/%2e%2e/secret.txt",
        "/assets/../../secret.txt",
        "/assets/..%2F..%2Fsecret.txt",
        "/h/..%2f..%2fsecret.txt",
        "/h/../../secret.txt",
        "/../secret.txt",
        "/catalog.internal.json",
    ],
)
def test_real_server_traversal(server: int, target: str) -> None:
    status, _, body = _request(server, "GET", target)
    assert status == 404
    assert SECRET_TEXT not in body
