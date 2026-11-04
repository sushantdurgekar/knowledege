"""The `.backup` v1 file format (build-contracts.md section 20, spec section 4.10).

    "SHBK" | version 1 (1 byte) | flags (1 byte; bit 0 = encrypted) | header length (u32 BE)
    | header JSON (UTF-8, no secrets) | body

Body: one gzip stream of NDJSON records (`settings`, `tombstone`*, `user`*,
`progress`*, then `end` with the counts and the sha256 of every preceding line,
newline included). Encrypted files carry that gzip stream in AES-256-GCM frames
(see `crypto.py`). The reader arrives in M3; `site/scripts/backup_tool.py` verifies
files offline today.
"""

from __future__ import annotations

import hashlib
import json
import struct
from datetime import datetime
from typing import Any

from app.quota.pacific import iso_utc

MAGIC = b"SHBK"
VERSION = 1
FLAG_ENCRYPTED = 0x01
FORMAT = "studyhubs-backup"
MAX_HEADER = 1 << 20
RECORD_ORDER = ("settings", "tombstone", "user", "progress")
SETTINGS_KEYS = ("tz", "notice")  # whitelisted: never maintenance, jobs or secrets


def compact(obj: Any) -> bytes:
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def make_header(
    *,
    created_at: datetime,
    version: str,
    commit: str,
    store: str,
    project: str | None,
    origin: str,
    consistent: bool,
    encryption: dict[str, Any] | None,
    estimated: dict[str, int],
) -> dict[str, Any]:
    return {
        "format": FORMAT,
        "v": VERSION,
        "createdAt": iso_utc(created_at),
        "app": {"version": version, "commit": commit},
        "source": {"store": store, "project": project, "origin": origin},
        "consistent": consistent,
        "compression": "gzip",
        "encryption": encryption,
        "estimated": estimated,
    }


def preamble(header: dict[str, Any], *, encrypted: bool) -> bytes:
    """Magic, version, flags, header length and the header JSON: the file's first bytes."""
    header_json = compact(header)
    if len(header_json) > MAX_HEADER:
        raise ValueError("backup header too large")
    flags = FLAG_ENCRYPTED if encrypted else 0
    return MAGIC + bytes([VERSION, flags]) + struct.pack(">I", len(header_json)) + header_json


def header_aad(preamble_bytes: bytes) -> bytes:
    """AAD of every encrypted frame: SHA-256(magic | version | flags | headerLen | headerJSON)."""
    return hashlib.sha256(preamble_bytes).digest()


def settings_record(value: dict[str, Any]) -> bytes:
    kept = {key: value.get(key) for key in SETTINGS_KEYS}
    return compact({"t": "settings", "key": "site", "value": kept}) + b"\n"


def tombstone_record(h: str, at: datetime) -> bytes:
    return compact({"t": "tombstone", "h": h, "at": iso_utc(at)}) + b"\n"


def user_record(
    *,
    uid: str,
    email: str | None,
    email_verified: bool,
    name: str | None,
    photo: str | None,
    provider: str | None,
    created_at: datetime | None,
    last_login_at: datetime | None,
) -> bytes:
    return (
        compact(
            {
                "t": "user",
                "uid": uid,
                "email": email,
                "emailVerified": email_verified,
                "name": name,
                "photo": photo,
                "provider": provider,
                "createdAt": iso_utc(created_at) if created_at else None,
                "lastLoginAt": iso_utc(last_login_at) if last_login_at else None,
            }
        )
        + b"\n"
    )


def progress_record(uid: str, hub: str, part: str, upd: int, raw_json: bytes) -> bytes:
    """`{"t":"progress",...,"data":<payload>}` with the stored compact JSON spliced in as is.

    The stored payload is `json.dumps(payload, separators=(",", ":"), ensure_ascii=False)`,
    so it is one line of valid JSON; anything else is re-serialized to be safe.
    """
    if b"\n" in raw_json or not raw_json.startswith(b"{"):
        raw_json = compact(json.loads(raw_json))
    head = compact({"t": "progress", "uid": uid, "hub": hub, "part": part, "upd": upd})
    return head[:-1] + b',"data":' + raw_json + b"}\n"


def end_record(counts: dict[str, int], lines_sha256: str) -> bytes:
    return compact({"t": "end", "counts": counts, "sha256": lines_sha256}) + b"\n"
