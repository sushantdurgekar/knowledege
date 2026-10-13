"""The `.backup` reader the restore validates with (build-contracts.md sections 20, 24):
record schema, order, counts and the end sha256 on hand-made files, plus a writer round trip."""

from __future__ import annotations

import gzip
import hashlib
import json
import os
from pathlib import Path
from typing import Any

import pytest

from app.backup import reader
from app.backup.format import make_header, preamble
from app.store.memory import MemoryStore
from tests.restore_support import AT, PASS, seed, write_backup

UID = "user-1"
HUB = "ai103"


def line(obj: dict[str, Any]) -> bytes:
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False).encode() + b"\n"


def good_records() -> list[dict[str, Any]]:
    return [
        {"t": "settings", "key": "site", "value": {"tz": "Asia/Kolkata", "notice": None}},
        {"t": "tombstone", "h": "a" * 64, "at": "2026-10-12T09:30:00Z"},
        {
            "t": "user",
            "uid": UID,
            "email": "a@example.com",
            "emailVerified": True,
            "name": None,
            "photo": None,
            "provider": "google.com",
            "createdAt": "2026-10-12T09:30:00Z",
            "lastLoginAt": None,
        },
        {
            "t": "progress",
            "uid": UID,
            "hub": HUB,
            "part": "main",
            "upd": 1_790_000_000_000,
            "data": {"S": {}},
        },
    ]


def make_file(
    path: Path, records: list[dict[str, Any]], *, end: dict[str, Any] | None = None, tail: bytes = b""
) -> Path:
    body = b"".join(line(r) for r in records)
    counts = {
        k: sum(1 for r in records if r.get("t") == k) for k in ("settings", "tombstone", "user", "progress")
    }
    end = (
        end if end is not None else {"t": "end", "counts": counts, "sha256": hashlib.sha256(body).hexdigest()}
    )
    header = make_header(
        created_at=AT,
        version="t",
        commit="t",
        store="memory",
        project=None,
        origin="http://x",
        consistent=True,
        encryption=None,
        estimated={"user": 1, "progress": 1},
    )
    path.write_bytes(preamble(header, encrypted=False) + gzip.compress(body + line(end) + tail))
    return path


def check(tmp_path: Path, path: Path, passphrase: str | None = None) -> reader.Verified:
    _, verified = reader.validate_file(
        path, tmp_path / "ready.ndjson.gz", passphrase=passphrase, max_part_gz=131_072
    )
    return verified


def test_a_good_file_round_trips(tmp_path: Path) -> None:
    path = make_file(tmp_path / "ok.backup", good_records())
    verified = check(tmp_path, path)
    assert verified.counts == {"settings": 1, "tombstone": 1, "user": 1, "progress": 1}
    assert verified.file_sha256 == hashlib.sha256(path.read_bytes()).hexdigest()
    rows = list(reader.iter_ready(tmp_path / "ready.ndjson.gz"))
    assert [n for n, _ in rows] == [1, 2, 3, 4, 5]
    assert [r["t"] for _, r in rows] == ["settings", "tombstone", "user", "progress", "end"]


def _bad(records: list[dict[str, Any]], i: int, **changes: Any) -> list[dict[str, Any]]:
    out = [dict(r) for r in records]
    out[i].update(changes)
    return out


@pytest.mark.parametrize(
    ("records", "message"),
    [
        (_bad(good_records(), 3, uid="bad uid!"), "uid"),
        (_bad(good_records(), 3, hub="AI 103"), "hub"),
        (_bad(good_records(), 3, part="notes"), "part"),
        (_bad(good_records(), 3, upd="1"), "upd"),
        (_bad(good_records(), 3, data=[1]), "not an object"),
        (_bad(good_records(), 3, data={"upd": 5}), "data.upd"),
        (_bad(good_records(), 3, data={"hub": "other"}), "data.hub"),
        (_bad(good_records(), 3, data={"x": os.urandom(200_000).hex()}), "MAX_PART_GZ"),
        (_bad(good_records(), 2, emailVerified="yes"), "emailVerified"),
        (_bad(good_records(), 2, createdAt="yesterday"), "time"),
        (_bad(good_records(), 1, h="xyz"), "hash"),
        (_bad(good_records(), 0, key="other"), "settings"),
        (_bad(good_records(), 0, t="mystery"), "unknown record type"),
        ([good_records()[2], good_records()[0]], "out of order"),
        ([good_records()[0], good_records()[0]], "more than one settings"),
        ([{k: v for k, v in good_records()[3].items() if k != "data"}], "lacks data"),
    ],
)
def test_malformed_records_are_refused(tmp_path: Path, records: list[dict[str, Any]], message: str) -> None:
    path = make_file(tmp_path / "bad.backup", records)
    with pytest.raises(reader.Invalid, match=message):
        check(tmp_path, path)
    assert not (tmp_path / "ready.ndjson.gz").exists()
    assert not (tmp_path / "ready.ndjson.gz.tmp").exists()


def test_end_record_checks(tmp_path: Path) -> None:
    records = good_records()
    counts = {"settings": 1, "tombstone": 1, "user": 1, "progress": 1}
    wrong_counts = {"t": "end", "counts": {**counts, "user": 2}, "sha256": "0" * 64}
    with pytest.raises(reader.Invalid, match="counts"):
        check(tmp_path, make_file(tmp_path / "a.backup", records, end=wrong_counts))
    wrong_sha = {"t": "end", "counts": counts, "sha256": "0" * 64}
    with pytest.raises(reader.Invalid, match="sha256"):
        check(tmp_path, make_file(tmp_path / "b.backup", records, end=wrong_sha))
    with pytest.raises(reader.Invalid, match="after the end"):
        check(tmp_path, make_file(tmp_path / "c.backup", records, tail=line(records[0])))
    with pytest.raises(reader.Invalid, match=r"no newline|after the end"):
        check(tmp_path, make_file(tmp_path / "d.backup", records, tail=b"{}"))
    body = b"".join(line(r) for r in records)
    raw = make_file(tmp_path / "f.backup", records).read_bytes()
    (tmp_path / "g.backup").write_bytes(raw[: raw.index(b"\x1f\x8b")] + gzip.compress(body))
    with pytest.raises(reader.Invalid, match="no end record"):
        check(tmp_path, tmp_path / "g.backup")


def test_preamble_checks(tmp_path: Path) -> None:
    good = make_file(tmp_path / "ok.backup", good_records()).read_bytes()
    for blob, message in (
        (b"NOPE" + good[4:], "magic"),
        (good[:4] + b"\x02" + good[5:], "version"),
        (good[:5] + b"\x04" + good[6:], "flags"),
        (good[:5] + b"\x01" + good[6:], "disagree"),
        (good[:6] + b"\xff\xff\xff\xff" + good[10:], "header length"),
        (good[:20], "truncated"),
    ):
        path = tmp_path / "x.backup"
        path.write_bytes(blob)
        with pytest.raises(reader.Invalid, match=message):
            check(tmp_path, path)


def test_writer_round_trip_encrypted(tmp_path: Path) -> None:
    store = MemoryStore()
    seed(store, 5)
    path = write_backup(store, tmp_path / "s.backup", passphrase=PASS)
    with pytest.raises(reader.Invalid, match="passphrase"):
        check(tmp_path, path)
    with pytest.raises(reader.Invalid, match="bad tag"):
        check(tmp_path, path, passphrase="wrong passphrase!")
    verified = check(tmp_path, path, passphrase=PASS)
    assert verified.counts == {"settings": 1, "tombstone": 0, "user": 5, "progress": 17}
    with path.open("rb") as f:
        summary = reader.header_summary(reader.read_preamble(f))  # type: ignore[arg-type]
    assert summary["encrypted"] is True
    assert "salt" not in json.dumps(summary)
