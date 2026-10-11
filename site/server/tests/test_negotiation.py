"""Unit tests: Accept-Encoding negotiation, If-None-Match, Content-Disposition, allow-lists."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path

import pytest

from app.http_utils import content_disposition
from app.precompressed import (
    AssetDirectory,
    FileHasher,
    if_none_match,
    negotiate_encoding,
    parse_accept_encoding,
)

ALL = ("br", "gzip", "identity")


@pytest.mark.parametrize(
    ("header", "expected"),
    [
        (None, "identity"),  # no header: plain bytes for curl & co.
        ("", "identity"),  # empty: only identity is acceptable
        ("gzip", "gzip"),
        ("br", "br"),
        ("gzip, deflate, br", "br"),
        ("gzip, deflate, br, zstd", "br"),
        ("deflate", "identity"),
        ("BR", "br"),
        ("x-gzip", "gzip"),
        ("br;q=0, gzip", "gzip"),
        ("br;q=0.5, gzip;q=0.8", "gzip"),
        ("gzip;q=1.0, br;q=1.0", "br"),  # tie: server preference
        ("gzip;q=0.5", "gzip"),  # listed beats implicit identity
        ("br;q=0.001, identity;q=0.5", "identity"),
        ("identity", "identity"),
        ("*", "br"),
        ("*;q=0.5, br;q=0", "gzip"),
        ("*;q=0, identity", "identity"),
        ("*;q=0", "identity"),  # nothing acceptable: still identity, never 406
        ("identity;q=0, gzip;q=0, br;q=0", "identity"),
        (" gzip ; q=0.4 , br ; Q=0.3 ", "gzip"),  # whitespace, parameter-name case
        ("br;q=1.5, gzip", "gzip"),  # out-of-range q: element ignored
        ("br;q=abc, gzip;q=0.2", "gzip"),  # malformed q: element ignored
        ("br;q=.5, gzip;q=0.2", "gzip"),  # RFC qvalue grammar needs the leading digit
        ("gzip;level=9;q=0.7, br;q=0.6", "gzip"),  # extra parameters tolerated
        (",,, ;q=1, br", "br"),  # junk elements skipped
        ("b r, gzip", "gzip"),  # not a token
        ("br\t, gzip", "br"),  # whitespace around elements is ignored
    ],
)
def test_negotiate_matrix(header: str | None, expected: str) -> None:
    assert negotiate_encoding(header, ALL) == expected


@pytest.mark.parametrize(
    ("header", "available", "expected"),
    [
        ("br, gzip", ("gzip", "identity"), "gzip"),
        ("br", ("gzip", "identity"), "identity"),
        ("br, gzip", ("identity",), "identity"),
        ("*", ("gzip", "identity"), "gzip"),
    ],
)
def test_negotiate_only_offers_available_variants(
    header: str, available: tuple[str, ...], expected: str
) -> None:
    assert negotiate_encoding(header, available) == expected


def test_parse_accept_encoding_shapes() -> None:
    assert parse_accept_encoding(None) is None
    assert parse_accept_encoding("") == {}
    assert parse_accept_encoding("gzip;q=0.5, x-gzip;q=0.9") == {"gzip": 0.5}  # first wins
    assert parse_accept_encoding("br;q=1.000, identity;q=0") == {"br": 1.0, "identity": 0.0}


ETAG = '"0123abcd"'


@pytest.mark.parametrize(
    ("header", "matches"),
    [
        (None, False),
        ("", False),
        (ETAG, True),
        (f"W/{ETAG}", True),  # If-None-Match uses weak comparison
        ('"other"', False),
        (f'"other", {ETAG}', True),
        (f'"a",W/"b" ,  {ETAG} ', True),
        ("*", True),
        (" * ", True),
        ("0123abcd", False),  # unquoted is not an entity-tag
        ('w/"0123abcd"', False),  # the W/ prefix is case-sensitive
        ('"0123abcd-gzip"', False),
        ('"0123abcd"\n', True),  # surrounding whitespace is stripped first
    ],
)
def test_if_none_match(header: str | None, matches: bool) -> None:
    assert if_none_match(header, ETAG) is matches


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        (
            "AI-103 Study Hub.html",
            "attachment; filename=\"AI-103 Study Hub.html\"; filename*=UTF-8''AI-103%20Study%20Hub.html",
        ),
        (
            'Données \u2013 Hub ü "q" 100%.html',
            'attachment; filename="Donnees _ Hub u _q_ 100_.html"; '
            "filename*=UTF-8''Donn%C3%A9es%20%E2%80%93%20Hub%20%C3%BC%20%22q%22%20100%25.html",
        ),
        ("数据.html", "attachment; filename=\"__.html\"; filename*=UTF-8''%E6%95%B0%E6%8D%AE.html"),
        (
            "a\r\nX-Evil: 1.html",
            "attachment; filename=\"aX-Evil: 1.html\"; filename*=UTF-8''aX-Evil%3A%201.html",
        ),
        ("../../etc/passwd", "attachment; filename=\"....etcpasswd\"; filename*=UTF-8''....etcpasswd"),
        ("", "attachment; filename=\"download.html\"; filename*=UTF-8''download.html"),
        ("\x00\x01", "attachment; filename=\"download.html\"; filename*=UTF-8''download.html"),
        (
            "it's (v2) *.html",
            "attachment; filename=\"it's (v2) *.html\"; filename*=UTF-8''it%27s%20%28v2%29%20%2A.html",
        ),
    ],
)
def test_content_disposition(name: str, expected: str) -> None:
    value = content_disposition(name)
    assert value == expected
    value.encode("latin-1")  # must be a valid header value
    assert "\r" not in value
    assert "\n" not in value


def test_file_hasher_rehashes_changed_file(tmp_path: Path) -> None:
    path = tmp_path / "f.js"
    path.write_bytes(b"one")
    hasher = FileHasher()
    first = hasher.etag_for(path)
    assert hasher.cached(path, path.stat()) == first
    path.write_bytes(b"two!")
    os.utime(path, ns=(1, 1))
    second = hasher.etag_for(path)
    assert first != second
    assert second == f'"{hashlib.sha256(b"two!").hexdigest()}"'


def test_asset_directory_allow_list(tmp_path: Path) -> None:
    root = tmp_path / "pub"
    (root / "sub").mkdir(parents=True)
    (root / "a.js").write_bytes(b"a")
    (root / "a.js.br").write_bytes(b"x")
    (root / "a.js.gz").write_bytes(b"y")
    (root / "lonely.gz").write_bytes(b"z")  # no base file: an asset of its own
    (root / "sub" / "b.css").write_bytes(b"b")
    (root / ".hidden").write_bytes(b"h")
    (root / "link.js").symlink_to(tmp_path / "outside.js")
    (tmp_path / "outside.js").write_bytes(b"outside")

    flat = AssetDirectory(root)
    assert sorted(key for key, _ in flat) == ["a.js", "lonely.gz"]
    asset = flat.get("a.js")
    assert asset is not None
    assert set(asset.variants) == {"identity", "br", "gzip"}
    assert asset.media_type == "text/javascript; charset=utf-8"
    for key in ("a.js.br", ".hidden", "link.js", "sub/b.css", "../outside.js", "", "/a.js"):
        assert flat.get(key) is None

    deep = AssetDirectory(root, recursive=True)
    assert deep.get("sub/b.css") is not None
    assert deep.get("sub/../a.js") is None


def test_asset_directory_rescans_on_miss(tmp_path: Path) -> None:
    now = [0.0]
    directory = AssetDirectory(tmp_path, rescan_interval=2.0, clock=lambda: now[0])
    (tmp_path / "late.js").write_bytes(b"late")
    assert directory.get("late.js") is None  # scanned too recently
    now[0] = 5.0
    assert directory.get("late.js") is not None

    frozen = AssetDirectory(tmp_path / "none", rescan_interval=None, clock=lambda: now[0])
    (tmp_path / "none").mkdir()
    (tmp_path / "none" / "x.js").write_bytes(b"x")
    now[0] = 1000.0
    assert frozen.get("x.js") is None  # production: never rescans
