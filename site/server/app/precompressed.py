"""Serving files that were compressed at build time.

Every servable file can have `name.br` and `name.gz` siblings next to it. A request
gets the best variant the client accepts (br > gzip > identity), a strong ETag that
is the sha256 of the exact bytes sent (so each encoding has its own ETag), `Vary:
Accept-Encoding`, and a 304 when If-None-Match matches.

Path safety: request input is only ever used as a key into an allow-list built by
scanning the disk (`AssetDirectory`) or into the hub catalog. It is never joined
onto a filesystem path.
"""

from __future__ import annotations

import hashlib
import logging
import mimetypes
import os
import re
import time
from collections.abc import Callable, Collection, Iterator, Mapping
from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType

import anyio.to_thread
from starlette.requests import Request
from starlette.responses import FileResponse, Response

from app import pages

logger = logging.getLogger(__name__)

IDENTITY = "identity"
# Server preference order, best first. Ties in q-value go to the earlier entry.
ENCODING_PREFERENCE = ("br", "gzip", IDENTITY)
ENCODING_SUFFIXES: Mapping[str, str] = MappingProxyType({"br": ".br", "gzip": ".gz"})
COMPRESSED_SUFFIXES = frozenset(ENCODING_SUFFIXES.values())

# Unlisted identity stays acceptable (RFC 9110 section 12.5.3) but ranks below any
# coding the client listed with q > 0.
_IMPLICIT_IDENTITY_Q = 0.0001
_TOKEN_RE = re.compile(r"[!#$%&'*+.^_`|~0-9A-Za-z-]+")
_QVALUE_RE = re.compile(r"0(?:\.\d{0,3})?|1(?:\.0{0,3})?")
# One element of an If-None-Match list; empty list elements (",,") are allowed.
_ETAG_ITEM_RE = re.compile(r'[\s,]*((?:W/)?"[^"]*")[ \t]*(?:,|\Z)')

MEDIA_TYPES: Mapping[str, str] = MappingProxyType(
    {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json",
        ".map": "application/json",
        ".webmanifest": "application/manifest+json",
        ".svg": "image/svg+xml",
        ".txt": "text/plain; charset=utf-8",
        ".ico": "image/x-icon",
        ".png": "image/png",
        ".webp": "image/webp",
        ".woff2": "font/woff2",
        ".woff": "font/woff",
        ".wasm": "application/wasm",
    }
)


def media_type_for(name: str) -> str:
    suffix = Path(name).suffix.lower()
    if suffix in MEDIA_TYPES:
        return MEDIA_TYPES[suffix]
    guessed, _ = mimetypes.guess_type(name)
    return guessed or "application/octet-stream"


# --------------------------------------------------------------------------- negotiation


def parse_accept_encoding(header: str | None) -> dict[str, float] | None:
    """Parse Accept-Encoding into {coding: q}. Returns None when the header is absent.

    Codings are lower-cased and `x-gzip` is folded into `gzip`. An element with a
    malformed coding or q-value is ignored, as if the client had not listed it.
    """
    if header is None:
        return None
    prefs: dict[str, float] = {}
    for element in header.split(","):
        coding, *params = (part.strip() for part in element.split(";"))
        coding = coding.lower()
        if not coding or not _TOKEN_RE.fullmatch(coding):
            continue
        if coding == "x-gzip":
            coding = "gzip"
        q: float | None = 1.0
        for param in params:
            name, _, value = param.partition("=")
            if name.strip().lower() == "q":
                value = value.strip()
                q = float(value) if _QVALUE_RE.fullmatch(value) else None
        if q is not None and coding not in prefs:
            prefs[coding] = q
    return prefs


def negotiate_encoding(header: str | None, available: Collection[str]) -> str:
    """Pick the best available coding for an Accept-Encoding header value.

    No header means identity (curl and simple clients must get plain bytes). When
    nothing available is acceptable we still send identity rather than a 406.
    """
    prefs = parse_accept_encoding(header)
    if prefs is None:
        return IDENTITY
    wildcard = prefs.get("*")
    best, best_q = IDENTITY, 0.0
    for coding in ENCODING_PREFERENCE:
        if coding not in available:
            continue
        if coding in prefs:
            q = prefs[coding]
        elif wildcard is not None:
            q = wildcard
        else:
            q = _IMPLICIT_IDENTITY_Q if coding == IDENTITY else 0.0
        if q > best_q:
            best, best_q = coding, q
    return best


def if_none_match(header: str | None, etag: str) -> bool:
    """True when If-None-Match matches `etag` (weak comparison, RFC 9110 13.1.2)."""
    if header is None:
        return False
    header = header.strip()
    if header == "*":
        return True
    wanted = etag.removeprefix("W/")
    return any(tag.removeprefix("W/") == wanted for tag in _etag_list(header))


def _etag_list(header: str) -> Iterator[str]:
    """Entity-tags of an If-None-Match list, in order; parsing stops at the first malformed one."""
    pos = 0
    while pos < len(header):
        match = _ETAG_ITEM_RE.match(header, pos)
        if match is None:
            return
        yield match.group(1)
        pos = match.end()


# --------------------------------------------------------------------------- assets


@dataclass(frozen=True, slots=True)
class StaticAsset:
    """One logical file plus its precompressed siblings. Always has an identity variant."""

    media_type: str
    variants: Mapping[str, Path]  # encoding -> file

    @classmethod
    def probe(cls, identity_path: Path, media_type: str | None = None) -> StaticAsset | None:
        """Describe `identity_path` and whichever `.br` / `.gz` siblings exist; None if absent."""
        if not identity_path.is_file():
            return None
        variants = {IDENTITY: identity_path}
        for encoding, suffix in ENCODING_SUFFIXES.items():
            sibling = identity_path.with_name(identity_path.name + suffix)
            if sibling.is_file():
                variants[encoding] = sibling
        return cls(media_type or media_type_for(identity_path.name), MappingProxyType(variants))


class FileHasher:
    """Strong ETags: the sha256 of a file's bytes, cached by (path, inode, size, mtime).

    A rebuilt file gets a new key and is hashed again, so a long-running dev server
    never sends a stale ETag. `warm()` fills the cache at startup.
    """

    def __init__(self, max_entries: int = 4096) -> None:
        self._cache: dict[tuple[str, int, int, int], str] = {}
        self._max_entries = max_entries

    @staticmethod
    def _key(path: Path, st: os.stat_result) -> tuple[str, int, int, int]:
        return (str(path), st.st_ino, st.st_size, st.st_mtime_ns)

    def cached(self, path: Path, st: os.stat_result) -> str | None:
        return self._cache.get(self._key(path, st))

    def etag_for(self, path: Path, st: os.stat_result | None = None) -> str:
        st = st or path.stat()
        key = self._key(path, st)
        etag = self._cache.get(key)
        if etag is None:
            digest = hashlib.sha256()
            with path.open("rb") as fh:
                for chunk in iter(lambda: fh.read(1 << 20), b""):
                    digest.update(chunk)
            etag = f'"{digest.hexdigest()}"'
            if len(self._cache) >= self._max_entries:
                self._cache.clear()
            self._cache[key] = etag
        return etag

    async def etag_async(self, path: Path, st: os.stat_result) -> str:
        return self.cached(path, st) or await anyio.to_thread.run_sync(self.etag_for, path, st)

    def warm(self, asset: StaticAsset) -> None:
        for path in asset.variants.values():
            self.etag_for(path)


async def asset_response(
    request: Request,
    asset: StaticAsset,
    hasher: FileHasher,
    *,
    cache_control: str,
    headers: Mapping[str, str] | None = None,
    status_code: int = 200,
) -> Response:
    """Serve the negotiated variant of `asset`, or a 304 when the client's copy is current.

    `headers` (CSP, Content-Disposition, ...) go on the 200 and on the 304. Only a
    200 honours If-None-Match; other statuses (the SPA's 404 shell) are always sent
    in full, still with the file's ETag so no framework default replaces it.
    """
    encoding = negotiate_encoding(request.headers.get("accept-encoding"), asset.variants.keys())
    path = asset.variants[encoding]
    try:
        st = await anyio.to_thread.run_sync(os.stat, path)
        etag = await hasher.etag_async(path, st)
    except OSError as exc:
        # Listed at startup but gone now: the build was replaced under a running server.
        logger.error("Cannot serve %s: %s", path, exc)
        return pages.build_unavailable()

    response_headers = {
        "Cache-Control": cache_control,
        "ETag": etag,
        "Vary": "Accept-Encoding",
        **(headers or {}),
    }
    if status_code == 200 and if_none_match(request.headers.get("if-none-match"), etag):
        # No Content-Encoding/Type/Length on a 304: the cached response keeps its own.
        return Response(status_code=304, headers=response_headers)
    if encoding != IDENTITY:
        response_headers["Content-Encoding"] = encoding
    return FileResponse(
        path,
        status_code=status_code,
        media_type=asset.media_type,
        headers=response_headers,
        stat_result=st,
    )


class AssetDirectory:
    """Allow-list of the files under `root`, built by scanning the disk.

    Keys are POSIX paths relative to `root` ("index-abc.js", "fonts/x.woff2").
    Hidden entries, symlinks and the `.br`/`.gz` siblings are not keys of their own.
    A lookup miss rescans at most every `rescan_interval` seconds (None: never), so a
    client rebuilt next to a running dev server is picked up without a restart.
    """

    def __init__(
        self,
        root: Path,
        *,
        recursive: bool = False,
        rescan_interval: float | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.root = root
        self.recursive = recursive
        self.rescan_interval = rescan_interval
        self._clock = clock
        self._assets: dict[str, StaticAsset] = self._scan()
        self._scanned_at = clock()

    def __len__(self) -> int:
        return len(self._assets)

    def __iter__(self) -> Iterator[tuple[str, StaticAsset]]:
        return iter(self._assets.items())

    def get(self, key: str) -> StaticAsset | None:
        asset = self._assets.get(key)
        if asset is None and self._may_rescan():
            self._assets = self._scan()
            self._scanned_at = self._clock()
            asset = self._assets.get(key)
        return asset

    def _may_rescan(self) -> bool:
        return self.rescan_interval is not None and self._clock() - self._scanned_at >= self.rescan_interval

    def _scan(self) -> dict[str, StaticAsset]:
        files: set[str] = set()
        self._collect(self.root, "", files)
        assets: dict[str, StaticAsset] = {}
        for rel in files:
            if Path(rel).suffix in COMPRESSED_SUFFIXES and rel[: -len(Path(rel).suffix)] in files:
                continue  # a precompressed sibling, attached to its base below
            variants = {IDENTITY: self.root / rel}
            for encoding, suffix in ENCODING_SUFFIXES.items():
                if rel + suffix in files:
                    variants[encoding] = self.root / (rel + suffix)
            assets[rel] = StaticAsset(media_type_for(rel), MappingProxyType(variants))
        return assets

    def _collect(self, directory: Path, prefix: str, out: set[str]) -> None:
        try:
            entries = list(os.scandir(directory))
        except OSError:
            return  # missing directory: empty allow-list
        for entry in entries:
            if entry.name.startswith(".") or entry.is_symlink():
                continue
            if entry.is_file(follow_symlinks=False):
                out.add(prefix + entry.name)
            elif self.recursive and entry.is_dir(follow_symlinks=False):
                self._collect(Path(entry.path), f"{prefix}{entry.name}/", out)
