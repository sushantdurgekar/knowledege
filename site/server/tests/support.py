"""Test support: a fake collector build and a fake React/bridge build, made in tmp_path.

No binary fixture is committed (the vault ignores *.gz): the `.gz` files are made
with gzip here and the `.br` files are recognisable fake bytes, which is all the
server needs since it never decodes them.
"""

from __future__ import annotations

import base64
import gzip
import hashlib
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import unquote

import anyio
import httpx2
from fastapi.testclient import TestClient

SECRET_TEXT = b"TOP-SECRET-DO-NOT-SERVE"

# What APP_ENV=production needs since M1 (build-contracts.md section 8). The project id
# uses the emulator-only "demo-" prefix, so nothing here could reach a real project.
PROD_SECRET_KEY = "production-test-secret-key-0123456789abcdef"
PROD_PROJECT_ID = "demo-studyhubs-prod"
PROD_WEB_CONFIG = {
    "apiKey": "test-api-key",
    "authDomain": "demo-studyhubs-prod.firebaseapp.com",
    "projectId": PROD_PROJECT_ID,
    "appId": "1:000000000000:web:0000000000000000",
}
PROD_ENV = {
    "SECRET_KEY": PROD_SECRET_KEY,
    "FIREBASE_PROJECT_ID": PROD_PROJECT_ID,
    "FIREBASE_WEB_CONFIG": json.dumps(PROD_WEB_CONFIG),
}
_INLINE_SCRIPT_RE = re.compile(rb"<script\b([^>]*)>([\s\S]*?)</script\s*>", re.IGNORECASE)


def fake_br(data: bytes) -> bytes:
    """Stand-in for brotli output: distinct from the identity and gzip bytes."""
    return b"FAKE-BR\x00" + hashlib.sha256(data).digest() + data[::-1][:200]


def write_variants(path: Path, data: bytes, *, br: bool = True, gz: bool = True) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    if gz:
        path.with_name(path.name + ".gz").write_bytes(gzip.compress(data, mtime=0))
    if br:
        path.with_name(path.name + ".br").write_bytes(fake_br(data))


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def quoted_sha(data: bytes) -> str:
    return f'"{sha256_hex(data)}"'


HUB_SPECS: list[dict[str, Any]] = [
    {
        "id": "ai103",
        "slug": "ai-103",
        "title": "AI-103 Study Hub",
        "engine": "v2",
        "downloadName": "AI-103 Study Hub.html",
        "legacyKeys": [],
    },
    {
        "id": "ai901",
        "slug": "ai-901",
        "title": "AI-901 Study Hub",
        "engine": "legacy",
        "downloadName": "AI-901 Study Hub.html",
        "legacyKeys": ["ai901hub.v1"],
    },
    {
        "id": "dsa-l1",
        "slug": "dsa-l1-foundation",
        "title": "DSA L1 Foundation",
        "engine": "v2",
        # Non-ASCII, a space, quotes and a percent sign: exercises RFC 5987/6266 encoding.
        "downloadName": 'Données \u2013 Hub ü "q" 100%.html',  # en dash
        "legacyKeys": [],
    },
]


def hub_original(spec: dict[str, Any]) -> bytes:
    filler = "".join(
        f"<p>Module {i}: café, naïve, résumé — lorem ipsum dolor sit amet.</p>\n" for i in range(60)
    )
    html = (
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        f"<title>{spec['title']}</title>\n<style>body{{font-family:sans-serif}}</style>\n"
        "</head>\n<body>\n"
        f"<script>window.HUB={{id:{json.dumps(spec['id'])},title:{json.dumps(spec['title'])}}};"
        "</script>\n"
        f"<h1>{spec['title']}</h1>\n{filler}"
        '<script>(function () { document.body.dataset.ready = "1"; })();</script>\n'
        "</body>\n</html>\n"
    )
    return html.encode("utf-8")


def injection(spec: dict[str, Any]) -> bytes:
    tag = (
        f'<script src="/_sh/bridge.js" data-hub-id="{spec["id"]}" data-slug="{spec["slug"]}" '
        f'data-engine="{spec["engine"]}"'
    )
    if spec["engine"] == "legacy":
        keys = ",".join(spec["legacyKeys"])
        seed = f'<script src="/api/seed/{spec["id"]}.js"></script>'
        return f'{tag} data-legacy-keys="{keys}"></script>{seed}'.encode()
    return f"{tag}></script>".encode()


def hub_csp(original: bytes) -> str:
    hashes = " ".join(
        "'sha256-" + base64.b64encode(hashlib.sha256(body).digest()).decode() + "'"
        for attrs, body in _INLINE_SCRIPT_RE.findall(original)
        if b"src" not in attrs
    )
    return (
        f"default-src 'none'; script-src 'self' {hashes}; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; "
        "img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; "
        "frame-ancestors 'none'; object-src 'none'"
    )


@dataclass
class FakeBuild:
    """The collector output layout from build-contracts.md section 1."""

    root: Path
    entries: dict[str, dict[str, Any]] = field(default_factory=dict)  # slug -> internal entry

    def hub_file(self, slug: str, name: str) -> bytes:
        return (self.root / "hubs" / slug / name).read_bytes()

    def write_internal(self, document: Any) -> None:
        (self.root / "catalog.internal.json").write_text(json.dumps(document), encoding="utf-8")


def make_build(root: Path, specs: list[dict[str, Any]] = HUB_SPECS) -> FakeBuild:
    build = FakeBuild(root)
    public_entries = []
    for spec in specs:
        original = hub_original(spec)
        head = original.lower().index(b"</head>")
        served = original[:head] + injection(spec) + original[head:]
        write_variants(root / "hubs" / spec["slug"] / "original.html", original)
        write_variants(root / "hubs" / spec["slug"] / "index.html", served)
        public = {
            **spec,
            "code": spec["title"].split()[0],
            "kind": "cert",
            "storageKeys": [f"studyhub.{spec['id']}.v2"],
            "bytes": len(original),
            "brBytes": len(fake_br(original)),
            "sha256": sha256_hex(original),
        }
        public_entries.append(public)
        build.entries[spec["slug"]] = {
            **public,
            "source": f"technical/certifications/{spec['slug']}/{spec['title']}.html",
            "csp": hub_csp(original),
            "servedSha256": sha256_hex(served),
        }
    meta = {"version": 1, "generatedAt": "2026-10-11T00:00:00Z"}
    write_variants(root / "catalog.json", json.dumps({**meta, "hubs": public_entries}).encode())
    build.write_internal({**meta, "hubs": list(build.entries.values())})
    (root / "build-report.json").write_text('{"ok": true}', encoding="utf-8")
    return build


@dataclass
class FakePublic:
    root: Path

    def read(self, rel: str) -> bytes:
        return (self.root / rel).read_bytes()


SHELL_HTML = (
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Study Hubs</title>'
    '<script type="module" crossorigin src="/assets/index-AbC123.js"></script>'
    '<link rel="stylesheet" href="/assets/index-AbC123.css"></head>'
    '<body><div id="root"></div><!-- ' + "padding " * 200 + "--></body></html>"
).encode()


def make_public(root: Path) -> FakePublic:
    root.mkdir(parents=True, exist_ok=True)
    (root / "index.html").write_bytes(SHELL_HTML)  # > 1000 bytes and no .gz sibling
    (root / "favicon.svg").write_bytes(b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>')
    (root / "robots.txt").write_bytes(
        b"User-agent: *\nDisallow: /api/\nDisallow: /h/*/download\nDisallow: /admin\n"
    )
    write_variants(root / "assets" / "index-AbC123.js", b"console.log('shell');\n" * 80)
    (root / "assets" / "index-AbC123.css").write_bytes(b"body{margin:0}\n")
    (root / "assets" / "fonts").mkdir()
    (root / "assets" / "fonts" / "inter-AbC.woff2").write_bytes(b"wOF2-fake")
    write_variants(root / "_sh" / "bridge.js", b"(function(){/* bridge */})();\n" * 50)
    write_variants(root / "_sh" / "fflate.js", b"window.__shFflate={gzipSync:function(){}};\n", br=False)
    (root / ".vite").mkdir()
    (root / ".vite" / "manifest.json").write_bytes(b'{"hidden": true}')
    return FakePublic(root)


def fetch(
    client: TestClient,
    url: str,
    *,
    accept_encoding: str | None = "identity",
    method: str = "GET",
    headers: dict[str, str] | None = None,
) -> tuple[httpx2.Response, bytes]:
    """Send a request and return (response, raw body bytes, not content-decoded).

    accept_encoding=None sends no Accept-Encoding header at all.
    """
    request = client.build_request(method, url, headers=headers)
    if accept_encoding is None:
        del request.headers["accept-encoding"]
    else:
        request.headers["accept-encoding"] = accept_encoding
    response = client.send(request, stream=True)
    try:
        raw = b"".join(response.iter_raw())
    finally:
        response.close()
    return response, raw


def asgi_get(app: Any, raw_path: bytes, query: bytes = b"") -> tuple[int, dict[str, str], bytes]:
    """Call the ASGI app directly with an un-normalised path, the way uvicorn decodes it.

    httpx would resolve `..` segments before sending; uvicorn passes them through.
    """

    async def run() -> tuple[int, dict[str, str], bytes]:
        scope = {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": unquote(raw_path.decode("latin-1")),
            "raw_path": raw_path,
            "root_path": "",
            "query_string": query,
            "headers": [(b"host", b"testserver"), (b"accept-encoding", b"identity")],
            "client": ("127.0.0.1", 50000),
            "server": ("testserver", 80),
        }
        status = 0
        headers: dict[str, str] = {}
        body = bytearray()

        async def receive() -> dict[str, Any]:
            return {"type": "http.request", "body": b"", "more_body": False}

        async def send(message: dict[str, Any]) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                headers.update({k.decode().lower(): v.decode() for k, v in message["headers"]})
            elif message["type"] == "http.response.body":
                body.extend(message.get("body", b""))

        await app(scope, receive, send)
        return status, headers, bytes(body)

    return anyio.run(run)
