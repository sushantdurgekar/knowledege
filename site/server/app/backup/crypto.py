"""AES-256-GCM-STREAM-1: the encrypted body of a `.backup` file (build-contracts.md section 20).

- Key: scrypt(NFKC(passphrase), salt 16 bytes, n=2**15, r=8, p=1, 32 bytes).
- The gzip stream is cut into 1 MiB segments; each becomes one frame
  `[u32 BE length][ciphertext | 16-byte tag]`.
- Nonce (12 bytes) = noncePrefix (7 random bytes) | u32 BE frame counter | last flag (1 byte).
- AAD = SHA-256 of the file preamble (magic .. header JSON), so the header cannot be
  changed either.

Every frame but the last holds exactly one segment, the last holds 1 byte to one
segment and has the last flag set. A reader therefore rejects a bad tag, a reordered,
missing or repeated frame (the counter is in the nonce), a missing final frame and
any bytes after it.
"""

from __future__ import annotations

import base64
import binascii
import os
import struct
import unicodedata
from collections.abc import Iterator
from typing import Any

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

ALG = "AES-256-GCM-STREAM-1"
SEGMENT = 1 << 20
TAG = 16
SALT_BYTES = 16
PREFIX_BYTES = 7
SCRYPT_N, SCRYPT_R, SCRYPT_P = 2**15, 8, 1
MIN_PASSPHRASE = 12


class DecryptError(ValueError):
    """Wrong passphrase, tampering or truncation."""


def derive_key(
    passphrase: str, salt: bytes, *, n: int = SCRYPT_N, r: int = SCRYPT_R, p: int = SCRYPT_P
) -> bytes:
    normalized = unicodedata.normalize("NFKC", passphrase).encode("utf-8")
    return Scrypt(salt=salt, length=32, n=n, r=r, p=p).derive(normalized)


def nonce(prefix: bytes, counter: int, last: bool) -> bytes:
    return prefix + struct.pack(">I", counter) + (b"\x01" if last else b"\x00")


def new_params() -> dict[str, Any]:
    """The header's `encryption` object for a new file (random salt and nonce prefix)."""
    return {
        "alg": ALG,
        "kdf": "scrypt",
        "n": SCRYPT_N,
        "r": SCRYPT_R,
        "p": SCRYPT_P,
        "salt": base64.b64encode(os.urandom(SALT_BYTES)).decode("ascii"),
        "noncePrefix": base64.b64encode(os.urandom(PREFIX_BYTES)).decode("ascii"),
        "segment": SEGMENT,
    }


def check_params(params: Any) -> None:
    """Refuse anything but the v1 `encryption` object before the KDF runs.

    The header is only authenticated once a frame opens, so its values are untrusted until
    then: a tampered `n`, `r` or `p` could crash scrypt or ask it for gigabytes of memory.
    v1 fixes them (n=2**15, r=8, p=1, 1 MiB segments, 16-byte salt, 7-byte nonce prefix).
    """

    def exact(name: str, value: object) -> bool:
        found = params.get(name)
        return type(found) is type(value) and found == value

    def b64_len(name: str) -> int:
        return len(base64.b64decode(params.get(name), validate=True))

    try:
        ok = (
            isinstance(params, dict)
            and exact("alg", ALG)
            and exact("kdf", "scrypt")
            and exact("n", SCRYPT_N)
            and exact("r", SCRYPT_R)
            and exact("p", SCRYPT_P)
            and exact("segment", SEGMENT)
            and b64_len("salt") == SALT_BYTES
            and b64_len("noncePrefix") == PREFIX_BYTES
        )
    except (TypeError, ValueError, binascii.Error):
        ok = False
    if not ok:
        raise DecryptError("unsupported or damaged encryption parameters")


def key_for(params: dict[str, Any], passphrase: str) -> bytes:
    """The file key (the parameters are checked first: see `check_params`)."""
    check_params(params)
    return derive_key(
        passphrase,
        base64.b64decode(params["salt"]),
        n=int(params["n"]),
        r=int(params["r"]),
        p=int(params["p"]),
    )


class Framer:
    """Turns the gzip stream into encrypted frames, segment by segment."""

    def __init__(self, key: bytes, params: dict[str, Any], aad: bytes) -> None:
        self._aead = AESGCM(key)
        self._prefix = base64.b64decode(params["noncePrefix"])
        if len(self._prefix) != PREFIX_BYTES:
            raise ValueError("noncePrefix must be 7 bytes")
        self._segment = int(params["segment"])
        self._aad = aad
        self._buffer = bytearray()
        self._counter = 0
        self._closed = False

    def _frame(self, plain: bytes, last: bool) -> bytes:
        sealed = self._aead.encrypt(nonce(self._prefix, self._counter, last), plain, self._aad)
        self._counter += 1
        return struct.pack(">I", len(sealed)) + sealed

    def feed(self, data: bytes) -> bytes:
        """Frames for every full segment buffered beyond the current one (never the last)."""
        if self._closed:
            raise ValueError("framer is closed")
        self._buffer += data
        out = bytearray()
        # Keep at least one byte back so the final frame is never empty.
        while len(self._buffer) > self._segment:
            out += self._frame(bytes(self._buffer[: self._segment]), last=False)
            del self._buffer[: self._segment]
        return bytes(out)

    def finish(self) -> bytes:
        self._closed = True
        frame = self._frame(bytes(self._buffer), last=True)
        self._buffer.clear()
        return frame


def decrypt_frames(
    body: Iterator[bytes] | bytes, key: bytes, params: dict[str, Any], aad: bytes
) -> Iterator[bytes]:
    """Yield the plaintext segments of an encrypted body; raise DecryptError on any defect."""
    data = body if isinstance(body, bytes) else b"".join(body)
    aead = AESGCM(key)
    prefix = base64.b64decode(params["noncePrefix"])
    segment = int(params["segment"])
    pos, counter = 0, 0
    while True:
        if pos + 4 > len(data):
            raise DecryptError("missing final frame")
        (length,) = struct.unpack(">I", data[pos : pos + 4])
        if not TAG < length <= segment + TAG:
            raise DecryptError("bad frame length")
        if pos + 4 + length > len(data):
            raise DecryptError("truncated frame")
        sealed = data[pos + 4 : pos + 4 + length]
        pos += 4 + length
        at_end = pos == len(data)
        try:
            plain = aead.decrypt(nonce(prefix, counter, at_end), sealed, aad)
        except InvalidTag:
            try:  # does the frame open with the other last flag? Then the framing is wrong.
                aead.decrypt(nonce(prefix, counter, not at_end), sealed, aad)
            except InvalidTag:
                raise DecryptError("bad tag (wrong passphrase or damaged file)") from None
            raise DecryptError("missing final frame" if at_end else "bytes after the final frame") from None
        if not at_end and len(plain) != segment:
            raise DecryptError("short frame before the end")
        counter += 1
        yield plain
        if at_end:
            return
