"""The `.backup` v1 reader (build-contracts.md sections 20 and 24): the restore's validator.

`validate_file` streams a staged upload once, in bounded memory:

    preamble (magic, version, flags, header; the exact v1 encryption parameters)
      -> frames (AES-256-GCM, every tag; a missing final frame, a counter gap, a
         reordered frame or bytes after the final frame all fail)
      -> one gzip member (CRC and length; nothing after it)
      -> NDJSON records (type, order, schema of each line, at most MAX_LINE bytes)
      -> the `end` record's counts and sha256 of every preceding line

and writes the verified lines, decrypted, to `ready.ndjson.gz` (through a temporary
file renamed only when the whole file is valid). A wrong passphrase, tampering or
truncation raises `Invalid` before anything reaches the target store.

`iter_ready` reads that file back for the plan and the restore job: it was written by
this server after validation, so it is parsed but not re-verified.

Independent of `site/scripts/backup_tool.py` on purpose (two implementations of the
format check each other in the tests).
"""

from __future__ import annotations

import base64
import gzip
import hashlib
import json
import struct
import zlib
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, BinaryIO

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.auth.identity import UID_RE
from app.backup import crypto
from app.backup.format import FLAG_ENCRYPTED, FORMAT, MAGIC, MAX_HEADER, VERSION
from app.progress.validate import compact_json, encode_gz
from app.store.base import HUB_ID_RE, PARTS, RESTORE_KINDS

READ = 1 << 16
MAX_LINE = 8 << 20  # a progress line holds one part (<= MAX_PART_GZ gzip, far less than this)
ORDER = (*RESTORE_KINDS, "end")
TOMBSTONE_LEN = 64
HEX = frozenset("0123456789abcdef")
REQUIRED = {
    "settings": ("key", "value"),
    "tombstone": ("h", "at"),
    "user": ("uid", "email", "emailVerified", "name", "photo", "provider", "createdAt", "lastLoginAt"),
    "progress": ("uid", "hub", "part", "upd", "data"),
    "end": ("counts", "sha256"),
}


class Invalid(ValueError):  # noqa: N818 - the validator's verdict
    """The file is not a valid, intact `.backup` v1 (or the passphrase is wrong)."""


@dataclass(frozen=True, slots=True)
class Preamble:
    header: dict[str, Any]
    flags: int
    raw: bytes  # magic .. header JSON: the AAD's input

    @property
    def encrypted(self) -> bool:
        return bool(self.flags & FLAG_ENCRYPTED)


@dataclass(frozen=True, slots=True)
class Verified:
    counts: dict[str, int]
    lines_sha256: str
    file_sha256: str
    size: int


def _read_exact(f: BinaryIO, n: int, what: str) -> bytes:
    data = f.read(n)
    if len(data) != n:
        raise Invalid(f"truncated {what}")
    return data


def read_preamble(f: BinaryIO) -> Preamble:
    if _read_exact(f, 4, "magic") != MAGIC:
        raise Invalid("not a .backup file (bad magic)")
    version, flags = _read_exact(f, 2, "version")
    if version != VERSION:
        raise Invalid(f"unsupported version {version}")
    if flags & ~FLAG_ENCRYPTED:
        raise Invalid(f"unknown flags {flags:#04x}")
    raw_len = _read_exact(f, 4, "header length")
    (length,) = struct.unpack(">I", raw_len)
    if not 2 <= length <= MAX_HEADER:
        raise Invalid("bad header length")
    raw = _read_exact(f, length, "header")
    try:
        header = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise Invalid("the header is not JSON") from None
    if not isinstance(header, dict) or header.get("format") != FORMAT or header.get("v") != VERSION:
        raise Invalid("not a studyhubs-backup v1 header")
    if header.get("compression") != "gzip":
        raise Invalid("unsupported compression")
    encrypted = bool(flags & FLAG_ENCRYPTED)
    if encrypted != isinstance(header.get("encryption"), dict):
        raise Invalid("the encrypted flag and the header disagree")
    if encrypted:
        try:
            crypto.check_params(header["encryption"])
        except crypto.DecryptError as exc:
            raise Invalid(str(exc)) from None
    return Preamble(header, flags, MAGIC + bytes([version, flags]) + raw_len + raw)


def header_summary(pre: Preamble) -> dict[str, Any]:
    """What the admin sees before validating: no secrets, no encryption parameters."""
    h = pre.header
    estimated = h.get("estimated") if isinstance(h.get("estimated"), dict) else {}
    source = h.get("source") if isinstance(h.get("source"), dict) else {}
    return {
        "createdAt": h.get("createdAt"),
        "source": {k: source.get(k) for k in ("store", "project", "origin")},
        "app": h.get("app") if isinstance(h.get("app"), dict) else None,
        "consistent": bool(h.get("consistent")),
        "encrypted": pre.encrypted,
        "estimated": {k: v for k, v in estimated.items() if isinstance(v, int)},
    }


def _plain(f: BinaryIO) -> Iterator[bytes]:
    while chunk := f.read(READ):
        yield chunk


def _frames(f: BinaryIO, key: bytes, params: dict[str, Any], aad: bytes) -> Iterator[bytes]:
    """Plaintext segments of an encrypted body, streamed frame by frame."""
    aead = AESGCM(key)
    prefix = base64.b64decode(params["noncePrefix"])
    segment = int(params["segment"])
    counter = 0
    head = f.read(4)
    while True:
        if len(head) < 4:
            raise Invalid("missing final frame" if not head else "truncated frame header")
        (length,) = struct.unpack(">I", head)
        if not crypto.TAG < length <= segment + crypto.TAG:
            raise Invalid(f"bad frame length in frame {counter}")
        sealed = f.read(length)
        if len(sealed) != length:
            raise Invalid(f"truncated frame {counter}")
        head = f.read(4)
        at_end = not head
        try:
            plain = aead.decrypt(crypto.nonce(prefix, counter, at_end), sealed, aad)
        except InvalidTag:
            try:  # opens with the other last flag: the framing is wrong, not the key
                aead.decrypt(crypto.nonce(prefix, counter, not at_end), sealed, aad)
            except InvalidTag:
                raise Invalid(f"bad tag in frame {counter} (wrong passphrase or damaged file)") from None
            raise Invalid("missing final frame" if at_end else "bytes after the final frame") from None
        if not at_end and len(plain) != segment:
            raise Invalid(f"short frame {counter} before the end")
        counter += 1
        yield plain
        if at_end:
            return


def _gunzip(chunks: Iterator[bytes]) -> Iterator[bytes]:
    """One gzip member, nothing after it, inflated in bounded pieces."""
    inflate = zlib.decompressobj(31)
    for chunk in chunks:
        if inflate.eof:
            if chunk:
                raise Invalid("bytes after the gzip stream")
            continue
        data = chunk
        while data:
            try:
                out = inflate.decompress(data, READ)
            except zlib.error as exc:
                raise Invalid(f"the gzip stream is damaged: {exc}") from None
            if out:
                yield out
            data = inflate.unconsumed_tail
        if inflate.eof and inflate.unused_data:
            raise Invalid("bytes after the gzip stream")
    if not inflate.eof:
        raise Invalid("truncated gzip stream")


def _lines(chunks: Iterator[bytes]) -> Iterator[tuple[bytes, bool]]:
    """(line, terminated): every newline-terminated line, then any unterminated rest."""
    buffer = b""
    for chunk in chunks:
        buffer += chunk
        if b"\n" in chunk:
            *complete, buffer = buffer.split(b"\n")
            for line in complete:
                if len(line) > MAX_LINE:
                    raise Invalid("a record is too long")
                yield line, True
        if len(buffer) > MAX_LINE:
            raise Invalid("a record is too long")
    if buffer:
        yield buffer, False


def _iso(value: Any) -> bool:
    if not isinstance(value, str) or not value:
        return False
    try:
        moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    return moment.tzinfo is not None


def _opt_text(value: Any, limit: int = 2048) -> bool:
    return value is None or (isinstance(value, str) and len(value) <= limit)


def _int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def schema_problem(kind: str, r: dict[str, Any], max_part_gz: int) -> str | None:
    """Why a record of type `kind` is malformed, or None."""
    if kind == "settings":
        if r["key"] != "site" or not isinstance(r["value"], dict):
            return "the settings record is malformed"
        return None
    if kind == "tombstone":
        h = r["h"]
        if not (isinstance(h, str) and len(h) == TOMBSTONE_LEN and set(h) <= HEX):
            return "a tombstone hash is malformed"
        return None if _iso(r["at"]) else "a tombstone time is malformed"
    uid = r["uid"]
    if not isinstance(uid, str) or UID_RE.fullmatch(uid) is None:
        return f"{kind} record with a malformed uid"
    if kind == "user":
        if not isinstance(r["emailVerified"], bool):
            return "emailVerified is not a boolean"
        if not all(_opt_text(r[k]) for k in ("email", "name", "photo", "provider")):
            return "a user field is not text"
        if not all(r[k] is None or _iso(r[k]) for k in ("createdAt", "lastLoginAt")):
            return "a user time is malformed"
        return None
    if kind == "progress":
        hub, part, upd, data = r["hub"], r["part"], r["upd"], r["data"]
        if not isinstance(hub, str) or HUB_ID_RE.fullmatch(hub) is None:
            return "a progress record with a malformed hub id"
        if part not in PARTS:
            return f"unknown part {part!r}"
        if not _int(upd) or upd <= 0:
            return "upd is not a positive integer"
        if not isinstance(data, dict):
            return "progress data is not an object"
        raw = compact_json(data)
        if len(raw) > max_part_gz and len(encode_gz(raw)) > max_part_gz:
            return f"a {part} part is larger than MAX_PART_GZ once compressed"
        if isinstance(data.get("upd"), int) and data["upd"] != upd:
            return "progress data.upd does not match the record"
        if isinstance(data.get("hub"), str) and data["hub"] != hub:
            return "progress data.hub does not match the record"
        return None
    return None


def check_records(
    lines: Iterator[tuple[bytes, bool]], *, max_part_gz: int, out: Callable[[bytes], None]
) -> dict[str, Any]:
    """Validate every record; hand each verified line (with its newline) to `out`."""
    sha = hashlib.sha256()
    counts = dict.fromkeys(RESTORE_KINDS, 0)
    stage = 0
    end: dict[str, Any] | None = None
    for line, terminated in lines:
        if not terminated:
            raise Invalid("the last record has no newline" if end is None else "bytes after the end record")
        if end is not None:
            raise Invalid("records after the end record")
        try:
            record = json.loads(line.decode("utf-8"), parse_constant=_reject)
        except (UnicodeDecodeError, ValueError, RecursionError):
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
            out(line + b"\n")
            continue
        problem = schema_problem(kind, record, max_part_gz)
        if problem:
            raise Invalid(problem)
        if kind == "settings" and counts["settings"]:
            raise Invalid("more than one settings record")
        sha.update(line + b"\n")
        counts[kind] += 1
        out(line + b"\n")
    if end is None:
        raise Invalid("no end record (truncated file)")
    if end["counts"] != counts:
        raise Invalid(f"counts {counts} do not match the end record {end['counts']}")
    if end["sha256"] != sha.hexdigest():
        raise Invalid("the sha256 of the records does not match the end record")
    return {"counts": counts, "linesSha256": sha.hexdigest()}


def _reject(name: str) -> Any:
    raise ValueError(f"{name} is not JSON")


class _Hashing:
    def __init__(self, f: BinaryIO) -> None:
        self._f = f
        self.sha = hashlib.sha256()
        self.size = 0

    def read(self, n: int = -1) -> bytes:
        data = self._f.read(n)
        self.sha.update(data)
        self.size += len(data)
        return data


def validate_file(
    path: Path, ready: Path, *, passphrase: str | None, max_part_gz: int
) -> tuple[Preamble, Verified]:
    """Check `path` end to end and write its verified records to `ready` (gzip NDJSON).

    Raises Invalid (wrong passphrase, tampering, truncation, bad records); `ready` then
    does not exist. The passphrase is used for the key only and dropped at once.
    """
    tmp = ready.with_name(ready.name + ".tmp")
    tmp.unlink(missing_ok=True)
    try:
        with path.open("rb") as raw:
            f = _Hashing(raw)
            pre = read_preamble(f)  # type: ignore[arg-type]
            if pre.encrypted:
                if not passphrase:
                    raise Invalid("this backup is encrypted: a passphrase is needed")
                params = pre.header["encryption"]
                key = crypto.key_for(params, passphrase)
                passphrase = None  # dropped: only the key is kept, for this read
                body = _frames(f, key, params, crypto_aad(pre))  # type: ignore[arg-type]
            else:
                body = _plain(f)  # type: ignore[arg-type]
            with gzip.open(tmp, "wb", compresslevel=6) as sink:
                result = check_records(_lines(_gunzip(body)), max_part_gz=max_part_gz, out=sink.write)
            if raw.read(1):
                raise Invalid("bytes after the body")
        tmp.replace(ready)
    except crypto.DecryptError as exc:
        tmp.unlink(missing_ok=True)
        raise Invalid(str(exc)) from None
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
    return pre, Verified(result["counts"], result["linesSha256"], f.sha.hexdigest(), f.size)


def crypto_aad(pre: Preamble) -> bytes:
    return hashlib.sha256(pre.raw).digest()


def iter_ready(ready: Path) -> Iterator[tuple[int, dict[str, Any]]]:
    """(line number from 1, record) of every record in a validated `ready.ndjson.gz`, `end` included."""
    with gzip.open(ready, "rb") as f:
        for number, line in enumerate(f, start=1):
            yield number, json.loads(line)
