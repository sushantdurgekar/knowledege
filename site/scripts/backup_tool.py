#!/usr/bin/env python3
"""Offline tool for Study Hubs `.backup` v1 files (build-contracts.md section 20).

    python backup_tool.py inspect <file>                 header, flags, size (no passphrase)
    python backup_tool.py verify  <file>                 full check; prints a JSON summary
    python backup_tool.py decrypt <file> [-o out.ndjson.gz]
                                                         the verified gzip NDJSON body
                                                         (`zcat out.ndjson.gz | jq` works)

Encrypted files need the passphrase: `--passphrase-file FILE`, else the
BACKUP_PASSPHRASE environment variable, else a prompt. Decryption needs the
`cryptography` package (the server venv has it); unencrypted files need only the
standard library.

`verify` checks the magic, version, flags and header; every frame tag (the counter and
the last flag are part of each nonce, and the header is the AAD), so a reordered,
dropped or added frame fails, as do a missing final frame and bytes after it; the
gzip stream (CRC, length, nothing after it); every record's type, order and required
fields; and the `end` record's counts and sha256 of all preceding lines. Exit status
0 means valid, 1 means invalid (the reason goes to stderr), 2 a usage error.

This file is deliberately independent of the server code: it is a second
implementation of the format, so the tests that run it check the writer for real.
"""

from __future__ import annotations

import argparse
import base64
import getpass
import hashlib
import json
import os
import struct
import sys
import unicodedata
import zlib
from collections.abc import Iterator
from pathlib import Path
from typing import Any, BinaryIO

MAGIC = b"SHBK"
VERSION = 1
FLAG_ENCRYPTED = 0x01
MAX_HEADER = 1 << 20
TAG = 16
READ = 1 << 16
ORDER = ("settings", "tombstone", "user", "progress", "end")
REQUIRED = {
    "settings": ("key", "value"),
    "tombstone": ("h", "at"),
    "user": ("uid", "email", "emailVerified", "name", "photo", "provider", "createdAt", "lastLoginAt"),
    "progress": ("uid", "hub", "part", "upd", "data"),
    "end": ("counts", "sha256"),
}
COUNT_NAMES = ("settings", "tombstone", "user", "progress")


class Invalid(Exception):  # noqa: N818 - the tool's verdict
    """The file is not a valid .backup v1."""


# -- preamble ---------------------------------------------------------------------------------


def read_exact(f: BinaryIO, n: int, what: str) -> bytes:
    data = f.read(n)
    if len(data) != n:
        raise Invalid(f"truncated {what}")
    return data


def read_preamble(f: BinaryIO) -> tuple[dict[str, Any], int, bytes]:
    """(header, flags, preamble bytes) after checking magic, version, flags and header."""
    magic = read_exact(f, 4, "magic")
    if magic != MAGIC:
        raise Invalid("not a .backup file (bad magic)")
    version, flags = read_exact(f, 2, "version")
    if version != VERSION:
        raise Invalid(f"unsupported version {version}")
    if flags & ~FLAG_ENCRYPTED:
        raise Invalid(f"unknown flags {flags:#04x}")
    raw_len = read_exact(f, 4, "header length")
    (length,) = struct.unpack(">I", raw_len)
    if not 2 <= length <= MAX_HEADER:
        raise Invalid("bad header length")
    raw = read_exact(f, length, "header")
    try:
        header = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise Invalid("header is not JSON") from None
    if not isinstance(header, dict) or header.get("format") != "studyhubs-backup" or header.get("v") != 1:
        raise Invalid("header is not a studyhubs-backup v1 header")
    if header.get("compression") != "gzip":
        raise Invalid("unsupported compression")
    encryption = header.get("encryption")
    encrypted = bool(flags & FLAG_ENCRYPTED)
    if encrypted != isinstance(encryption, dict):
        raise Invalid("the encrypted flag and the header disagree")
    if encrypted and (
        encryption.get("alg") != "AES-256-GCM-STREAM-1" or encryption.get("kdf") != "scrypt"  # type: ignore[union-attr]
    ):
        raise Invalid("unsupported encryption")
    return header, flags, magic + bytes([version, flags]) + raw_len + raw


# -- body -------------------------------------------------------------------------------------


def plain_body(f: BinaryIO) -> Iterator[bytes]:
    while chunk := f.read(READ):
        yield chunk


def encrypted_body(f: BinaryIO, header: dict[str, Any], aad: bytes, passphrase: str) -> Iterator[bytes]:
    try:
        from cryptography.exceptions import InvalidTag
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
    except ImportError:
        raise Invalid("decrypting needs the 'cryptography' package") from None
    enc = header["encryption"]
    try:
        salt = base64.b64decode(enc["salt"], validate=True)
        prefix = base64.b64decode(enc["noncePrefix"], validate=True)
        n, r, p, segment = int(enc["n"]), int(enc["r"]), int(enc["p"]), int(enc["segment"])
    except (KeyError, TypeError, ValueError):
        raise Invalid("bad encryption parameters") from None
    if len(salt) != 16 or len(prefix) != 7 or not 1 <= segment <= 1 << 26:
        raise Invalid("bad encryption parameters")
    secret = unicodedata.normalize("NFKC", passphrase).encode("utf-8")
    key = Scrypt(salt=salt, length=32, n=n, r=r, p=p).derive(secret)
    aead = AESGCM(key)

    def nonce(counter: int, last: bool) -> bytes:
        return prefix + struct.pack(">I", counter) + (b"\x01" if last else b"\x00")

    counter = 0
    head = f.read(4)
    while True:
        if len(head) < 4:
            raise Invalid("missing final frame" if not head else "truncated frame header")
        (length,) = struct.unpack(">I", head)
        if not TAG < length <= segment + TAG:
            raise Invalid(f"bad frame length in frame {counter}")
        sealed = f.read(length)
        if len(sealed) != length:
            raise Invalid(f"truncated frame {counter}")
        head = f.read(4)
        at_end = not head
        try:
            plain = aead.decrypt(nonce(counter, at_end), sealed, aad)
        except InvalidTag:
            try:
                aead.decrypt(nonce(counter, not at_end), sealed, aad)
            except InvalidTag:
                raise Invalid(f"bad tag in frame {counter} (wrong passphrase or damaged file)") from None
            raise Invalid("missing final frame" if at_end else "bytes after the final frame") from None
        if not at_end and len(plain) != segment:
            raise Invalid(f"short frame {counter} before the end")
        counter += 1
        yield plain
        if at_end:
            return


def gunzip(chunks: Iterator[bytes]) -> Iterator[bytes]:
    """One gzip member, nothing after it."""
    inflate = zlib.decompressobj(31)
    for chunk in chunks:
        if inflate.eof:
            if chunk:
                raise Invalid("bytes after the gzip stream")
            continue
        try:
            out = inflate.decompress(chunk)
        except zlib.error as exc:
            raise Invalid(f"gzip stream is damaged: {exc}") from None
        if out:
            yield out
        if inflate.eof and inflate.unused_data:
            raise Invalid("bytes after the gzip stream")
    if not inflate.eof:
        raise Invalid("truncated gzip stream")


# -- records ----------------------------------------------------------------------------------


def check_records(lines: Iterator[bytes]) -> dict[str, Any]:
    sha = hashlib.sha256()
    counts = dict.fromkeys(COUNT_NAMES, 0)
    stage = 0
    end: dict[str, Any] | None = None
    buffer = b""
    for chunk in lines:
        buffer += chunk
        *complete, buffer = buffer.split(b"\n")
        for line in complete:
            if end is not None:
                raise Invalid("records after the end record")
            try:
                record = json.loads(line.decode("utf-8"))
            except (UnicodeDecodeError, ValueError):
                raise Invalid("a record is not JSON") from None
            kind = record.get("t") if isinstance(record, dict) else None
            if kind not in ORDER:
                raise Invalid(f"unknown record type {kind!r}")
            position = ORDER.index(kind)
            if position < stage:
                raise Invalid(f"record {kind!r} is out of order")
            stage = position
            missing = [name for name in REQUIRED[kind] if name not in record]
            if missing:
                raise Invalid(f"{kind} record lacks {', '.join(missing)}")
            if kind == "end":
                end = record
                continue
            if kind == "progress" and not isinstance(record["data"], dict):
                raise Invalid("progress data is not an object")
            sha.update(line + b"\n")
            counts[kind] += 1
    if buffer:
        raise Invalid("the last record has no newline" if end is None else "bytes after the end record")
    if end is None:
        raise Invalid("no end record")
    if end["counts"] != counts:
        raise Invalid(f"counts {counts} do not match the end record {end['counts']}")
    if end["sha256"] != sha.hexdigest():
        raise Invalid("sha256 of the records does not match the end record")
    return {"counts": counts, "linesSha256": sha.hexdigest()}


# -- commands ---------------------------------------------------------------------------------


class Hashing:
    """A file wrapper that hashes everything read (the file sha256 for the summary)."""

    def __init__(self, f: BinaryIO) -> None:
        self._f = f
        self.sha = hashlib.sha256()
        self.size = 0

    def read(self, n: int = -1) -> bytes:
        data = self._f.read(n)
        self.sha.update(data)
        self.size += len(data)
        return data


def get_passphrase(args: argparse.Namespace) -> str:
    if args.passphrase_file:
        return Path(args.passphrase_file).read_text(encoding="utf-8").rstrip("\r\n")
    if os.environ.get("BACKUP_PASSPHRASE"):
        return os.environ["BACKUP_PASSPHRASE"]
    if sys.stdin.isatty():
        return getpass.getpass("Backup passphrase: ")
    raise Invalid("the file is encrypted: pass --passphrase-file or set BACKUP_PASSPHRASE")


def body_of(
    f: Hashing, header: dict[str, Any], flags: int, pre: bytes, args: argparse.Namespace
) -> Iterator[bytes]:
    if flags & FLAG_ENCRYPTED:
        return encrypted_body(f, header, hashlib.sha256(pre).digest(), get_passphrase(args))  # type: ignore[arg-type]
    return plain_body(f)  # type: ignore[arg-type]


def cmd_inspect(args: argparse.Namespace) -> dict[str, Any]:
    path = Path(args.file)
    with path.open("rb") as f:
        header, flags, _ = read_preamble(f)
    return {"file": str(path), "bytes": path.stat().st_size, "encrypted": bool(flags & 1), "header": header}


def cmd_verify(args: argparse.Namespace) -> dict[str, Any]:
    with Path(args.file).open("rb") as raw:
        f = Hashing(raw)
        header, flags, pre = read_preamble(f)  # type: ignore[arg-type]
        summary = check_records(gunzip(body_of(f, header, flags, pre, args)))
        if raw.read(1):
            raise Invalid("bytes after the body")
    return {
        "ok": True,
        "encrypted": bool(flags & FLAG_ENCRYPTED),
        "consistent": header.get("consistent"),
        "createdAt": header.get("createdAt"),
        "bytes": f.size,
        "fileSha256": f.sha.hexdigest(),
        **summary,
    }


def cmd_decrypt(args: argparse.Namespace) -> dict[str, Any]:
    out = Path(args.output or (str(args.file) + ".ndjson.gz"))
    with Path(args.file).open("rb") as raw:
        f = Hashing(raw)
        header, flags, pre = read_preamble(f)  # type: ignore[arg-type]
        body = body_of(f, header, flags, pre, args)
        tmp = out.with_name(out.name + ".part")
        try:
            with tmp.open("wb") as sink:

                def tee() -> Iterator[bytes]:
                    for chunk in body:
                        sink.write(chunk)
                        yield chunk

                summary = check_records(gunzip(tee()))
            tmp.replace(out)
        finally:
            tmp.unlink(missing_ok=True)
    return {"ok": True, "output": str(out), **summary}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Inspect, verify or decrypt a Study Hubs .backup file")
    parser.add_argument("command", choices=("inspect", "verify", "decrypt"))
    parser.add_argument("file")
    parser.add_argument("--passphrase-file", help="file holding the passphrase (first line)")
    parser.add_argument("-o", "--output", help="decrypt: where to write the gzip NDJSON")
    args = parser.parse_args(argv)
    commands = {"inspect": cmd_inspect, "verify": cmd_verify, "decrypt": cmd_decrypt}
    try:
        result = commands[args.command](args)
    except Invalid as exc:
        print(f"INVALID: {exc}", file=sys.stderr)
        return 1
    except OSError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
