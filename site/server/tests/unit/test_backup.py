"""`.backup` v1 writer, crypto and the offline tool (build-contracts.md sections 20, 22).

Every file is checked by `site/scripts/backup_tool.py`, an independent reader: a
round trip plain and encrypted, then the tamper matrix (a flipped byte, truncation,
a reordered frame, extra trailing bytes, a wrong passphrase) must all fail.
"""

from __future__ import annotations

import base64
import gzip
import json
import os
import random
import struct
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest

from app.backup import crypto
from app.backup.format import MAGIC, header_aad
from app.backup.writer import BackupSource, BackupTooLarge, BackupWriter
from app.config import SITE_DIR
from app.store.base import PartIn, UserRecord
from app.store.memory import MemoryStore

TOOL = SITE_DIR / "scripts" / "backup_tool.py"
AT = datetime(2026, 10, 12, 18, 30, tzinfo=UTC)
T = 1_790_000_000_000
PASS = "correct horse battery staple"
LINE_SEP = chr(0x2028)  # valid inside a JSON string, and must not split an NDJSON line
FULLWIDTH = "".join(chr(0xFF00 + ord(c) - 0x20) for c in "fullwidth")
SOURCE = BackupSource("0.1.0", "abc1234", "memory", None, "http://127.0.0.1:10000")


def payload(hub: str, upd: int, filler: str = "") -> dict[str, Any]:
    return {
        "hub": hub,
        "upd": upd,
        "S": {"v": 2, "done": {"m1": True}, "note": "é ✓ " + LINE_SEP, "fill": filler},
    }


def put(store: MemoryStore, uid: str, hub: str, part: str, data: dict[str, Any]) -> None:
    raw = json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode()
    store.put_parts(uid, hub, {part: PartIn(data["upd"], gzip.compress(raw), len(raw), 1)}, T)


def sample_store(*, users: int = 3, filler: int = 0, seed: int = 1) -> MemoryStore:
    rng = random.Random(seed)
    store = MemoryStore()
    for i in range(users):
        uid = f"user-{i:03d}"
        store.upsert_user(
            UserRecord(uid, f"{uid}@example.com", True, "Ünïcode", None, "google.com", last_login_at=AT),
            touch_login=True,
        )
        fill = base64.b64encode(rng.randbytes(filler)).decode() if filler else ""
        put(store, uid, "ai103", "main", payload("ai103", T + i, fill))
        put(store, uid, "ai103", "cards", {"hub": "ai103", "upd": T + i, "map": {"c1": {"due": i}}})
    store.put_tombstone("ab" * 32, AT)
    return store


def write(store: MemoryStore, path: Path, passphrase: str | None = None, **kwargs: Any) -> BackupWriter:
    writer = BackupWriter(
        store,
        source=SOURCE,
        created_at=AT,
        site={"tz": "Asia/Kolkata", "notice": "Hello", "maintenance": {"mode": "full"}, "secret": "x"},
        estimated={"user": 3, "progress": 3},
        consistent=True,
        passphrase=passphrase,
        **kwargs,
    )
    with path.open("wb") as f:
        for chunk in writer.chunks():
            f.write(chunk)
    return writer


def tool(*args: str, passphrase: str | None = None) -> subprocess.CompletedProcess[str]:
    env = {k: v for k, v in os.environ.items() if k != "BACKUP_PASSPHRASE"}
    if passphrase is not None:
        env["BACKUP_PASSPHRASE"] = passphrase
    return subprocess.run(  # noqa: S603 - our own script
        [sys.executable, str(TOOL), *args], capture_output=True, text=True, env=env, timeout=120, check=False
    )


def verify(path: Path, passphrase: str | None = None) -> dict[str, Any]:
    result = tool("verify", str(path), passphrase=passphrase)
    assert result.returncode == 0, result.stderr
    summary: dict[str, Any] = json.loads(result.stdout)
    return summary


def rejected(path: Path, passphrase: str | None = None) -> str:
    result = tool("verify", str(path), passphrase=passphrase)
    assert result.returncode == 1, (result.stdout, result.stderr)
    assert result.stderr.startswith("INVALID: ")
    return result.stderr


def split_frames(data: bytes) -> tuple[bytes, list[bytes]]:
    header_len = struct.unpack(">I", data[6:10])[0]
    pos = 10 + header_len
    pre, frames = data[:pos], []
    while pos < len(data):
        length = struct.unpack(">I", data[pos : pos + 4])[0]
        frames.append(data[pos : pos + 4 + length])
        pos += 4 + length
    return pre, frames


# -- round trips -------------------------------------------------------------------------------


def test_plain_round_trip(tmp_path: Path) -> None:
    path = tmp_path / "plain.backup"
    writer = write(sample_store(), path)
    data = path.read_bytes()
    assert data[:6] == MAGIC + b"\x01\x00"
    summary = verify(path)
    assert summary["counts"] == {"settings": 1, "tombstone": 1, "user": 3, "progress": 6}
    assert writer.result is not None
    assert (summary["bytes"], summary["fileSha256"]) == (writer.result.bytes, writer.result.file_sha256)
    assert (writer.result.docs, writer.result.consistent, writer.result.encrypted) == (3, True, False)
    # zcat | jq works: the body is one gzip stream of NDJSON
    header_len = struct.unpack(">I", data[6:10])[0]
    header = json.loads(data[10 : 10 + header_len])
    assert header["encryption"] is None
    assert header["estimated"] == {"user": 3, "progress": 3}
    assert header["app"] == {"version": "0.1.0", "commit": "abc1234"}
    lines = gzip.decompress(data[10 + header_len :]).split(b"\n")  # not splitlines: U+2028 is data
    assert lines.pop() == b""
    records = [json.loads(line) for line in lines]
    assert [r["t"] for r in records] == ["settings", "tombstone"] + ["user"] * 3 + ["progress"] * 6 + ["end"]
    assert records[0] == {"t": "settings", "key": "site", "value": {"tz": "Asia/Kolkata", "notice": "Hello"}}
    progress = records[5]
    assert progress["data"] == payload("ai103", T)  # the exact payload object
    assert records[2]["name"] == "Ünïcode"
    assert "maintenance" not in json.dumps(records)
    assert "secret" not in json.dumps(records)
    assert writer.result.storage_bytes == sum(
        len(json.dumps(r["data"], separators=(",", ":"), ensure_ascii=False).encode()) for r in records[5:11]
    )


def test_encrypted_round_trip_and_decrypt(tmp_path: Path) -> None:
    path = tmp_path / "enc.backup"
    writer = write(sample_store(), path, PASS)
    data = path.read_bytes()
    assert data[:6] == MAGIC + b"\x01\x01"
    assert b"user-000" not in data
    assert b"example.com" not in data
    summary = verify(path, PASS)
    assert summary["encrypted"] is True
    assert writer.result is not None
    assert summary["fileSha256"] == writer.result.file_sha256
    pass_file = tmp_path / "pass.txt"
    pass_file.write_text(PASS + "\n")
    out = tmp_path / "out.ndjson.gz"
    result = tool("decrypt", str(path), "-o", str(out), "--passphrase-file", str(pass_file))
    assert result.returncode == 0, result.stderr
    lines = gzip.decompress(out.read_bytes()).splitlines()
    assert json.loads(lines[-1])["t"] == "end"
    inspect = json.loads(tool("inspect", str(path)).stdout)
    assert inspect["encrypted"] is True
    assert inspect["header"]["encryption"]["alg"] == "AES-256-GCM-STREAM-1"
    assert inspect["header"]["encryption"]["n"] == 32768


def test_nfkc_passphrase(tmp_path: Path) -> None:
    path = tmp_path / "nfkc.backup"
    write(sample_store(users=1), path, FULLWIDTH + " passphrase")  # NFKC: fullwidth -> ascii
    verify(path, "fullwidth passphrase")


def test_empty_store(tmp_path: Path) -> None:
    path = tmp_path / "empty.backup"
    write(MemoryStore(), path)
    assert verify(path)["counts"] == {"settings": 1, "tombstone": 0, "user": 0, "progress": 0}


# -- tamper matrix ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def big_files(tmp_path_factory: pytest.TempPathFactory) -> dict[str, bytes]:
    """Plain and encrypted files of about 3 MiB (incompressible), so 3+ frames."""
    root = tmp_path_factory.mktemp("big")
    store = sample_store(users=32, filler=72_000, seed=7)
    out = {}
    for name, passphrase in (("plain", None), ("enc", PASS)):
        path = root / f"{name}.backup"
        write(store, path, passphrase)
        out[name] = path.read_bytes()
    return out


def flipped(data: bytes, at: int) -> bytes:
    return data[:at] + bytes([data[at] ^ 0x01]) + data[at + 1 :]


@pytest.mark.parametrize("name", ["plain", "enc"])
def test_tamper_matrix(name: str, big_files: dict[str, bytes], tmp_path: Path) -> None:
    data = big_files[name]
    passphrase = PASS if name == "enc" else None
    path = tmp_path / "x.backup"
    path.write_bytes(data)
    verify(path, passphrase)
    header_end = 10 + struct.unpack(">I", data[6:10])[0]
    cases = {
        "flip-body": flipped(data, len(data) // 2),
        "flip-last-byte": flipped(data, len(data) - 1),
        "truncated": data[: len(data) - 100],
        "truncated-half": data[: len(data) // 2],
        "trailing": data + b"\x00",
        "trailing-gzip": data + gzip.compress(b"{}\n"),
        "bad-magic": b"SHBX" + data[4:],
        "bad-version": data[:4] + b"\x02" + data[5:],
    }
    if name == "enc":
        cases["flip-header"] = flipped(data, header_end - 5)  # the header is the frames' AAD
        cases["flag-cleared"] = data[:5] + b"\x00" + data[6:]
    for case, tampered in cases.items():
        path.write_bytes(tampered)
        assert rejected(path, passphrase), case


def test_encrypted_frame_defects(big_files: dict[str, bytes], tmp_path: Path) -> None:
    pre, frames = split_frames(big_files["enc"])
    assert len(frames) >= 3
    path = tmp_path / "f.backup"
    cases = {
        "reordered": [frames[1], frames[0], *frames[2:]],
        "dropped-middle": [frames[0], *frames[2:]],
        "dropped-final": frames[:-1],
        "duplicated": [frames[0], *frames],
        "after-final": [*frames, frames[0]],
    }
    reasons = {}
    for case, parts in cases.items():
        path.write_bytes(pre + b"".join(parts))
        reasons[case] = rejected(path, PASS)
    assert "missing final frame" in reasons["dropped-final"]
    assert "bytes after the final frame" in reasons["after-final"]
    path.write_bytes(big_files["enc"])
    assert "bad tag" in rejected(path, "wrong passphrase!!")
    result = tool("verify", str(path))  # no passphrase at all, no terminal
    assert result.returncode == 1


def test_app_decryptor_matches(big_files: dict[str, bytes]) -> None:
    pre, frames = split_frames(big_files["enc"])
    header = json.loads(pre[10:])
    key = crypto.key_for(header["encryption"], PASS)
    aad = header_aad(pre)
    plain = b"".join(crypto.decrypt_frames(b"".join(frames), key, header["encryption"], aad))
    assert gzip.decompress(plain).endswith(b"}\n")
    with pytest.raises(crypto.DecryptError, match="missing final frame"):
        list(crypto.decrypt_frames(b"".join(frames[:-1]), key, header["encryption"], aad))
    with pytest.raises(crypto.DecryptError, match="bad tag"):
        list(
            crypto.decrypt_frames(
                b"".join([frames[1], frames[0], *frames[2:]]), key, header["encryption"], aad
            )
        )


def test_framer_edges() -> None:
    params = {**crypto.new_params(), "segment": 4}
    key = crypto.derive_key("p" * 12, b"s" * 16, n=2**10)
    framer = crypto.Framer(key, params, b"aad")
    out = framer.feed(b"12345678") + framer.finish()  # exactly two segments: the last keeps 4 bytes
    assert b"".join(crypto.decrypt_frames(out, key, params, b"aad")) == b"12345678"
    with pytest.raises(ValueError, match="closed"):
        framer.feed(b"x")


def test_max_bytes_and_short_passphrase(tmp_path: Path) -> None:
    with pytest.raises(BackupTooLarge):
        write(sample_store(users=8, filler=200_000), tmp_path / "big.backup", max_bytes=1_000_000)
    with pytest.raises(ValueError, match="at least 12"):
        write(sample_store(), tmp_path / "p.backup", "short")
