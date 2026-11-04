"""The `.backup` v1 writer: a synchronous generator of file bytes (build-contracts.md section 20).

    store pages (document-id cursors) -> NDJSON lines -> running sha256 of the lines
    -> zlib.compressobj(6, wbits=31) -> optional AES-GCM framer -> chunks

Memory stays at about one page of documents plus 2 MiB: nothing is collected, each
page is turned into lines and compressed before the next one is read. The file's own
sha256 and size are computed while streaming; `result` holds them (and the counts and
the storage recount) once the generator is exhausted.

StreamingResponse runs a sync iterator in the thread pool, so store calls never block
the event loop. A client that disconnects closes the generator (GeneratorExit), which
runs the caller's cleanup; `result` then stays None.
"""

from __future__ import annotations

import gzip
import hashlib
import zlib
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.backup import crypto
from app.backup.format import (
    end_record,
    header_aad,
    make_header,
    preamble,
    progress_record,
    settings_record,
    tombstone_record,
    user_record,
)
from app.store.base import PARTS, Store

CHUNK = 256 * 1024
PAGE = 300


class BackupTooLarge(Exception):  # noqa: N818 - reads better at the call site
    """The file grew past MAX_BACKUP_BYTES; the stream is aborted."""


@dataclass(frozen=True, slots=True)
class BackupResult:
    bytes: int
    file_sha256: str
    counts: dict[str, int]
    encrypted: bool
    consistent: bool
    docs: int  # progress documents seen
    storage_bytes: int  # sum of the payloads' compact JSON lengths (the n_* recount)


@dataclass
class BackupSource:
    """Where the backup comes from (the header's `app` and `source`)."""

    version: str
    commit: str
    store: str
    project: str | None
    origin: str


class BackupWriter:
    def __init__(
        self,
        store: Store,
        *,
        source: BackupSource,
        created_at: datetime,
        site: dict[str, Any],
        estimated: dict[str, int],
        consistent: bool,
        passphrase: str | None = None,
        page: int = PAGE,
        max_bytes: int | None = None,
    ) -> None:
        if passphrase is not None and len(passphrase) < crypto.MIN_PASSPHRASE:
            raise ValueError(f"passphrase must be at least {crypto.MIN_PASSPHRASE} characters")
        self._store = store
        self._page = page
        self._max = max_bytes
        self._site = site
        self.encrypted = passphrase is not None
        params = crypto.new_params() if passphrase is not None else None
        self.header = make_header(
            created_at=created_at,
            version=source.version,
            commit=source.commit,
            store=source.store,
            project=source.project,
            origin=source.origin,
            consistent=consistent,
            encryption=params,
            estimated=estimated,
        )
        self._preamble = preamble(self.header, encrypted=self.encrypted)
        self._framer = (
            crypto.Framer(crypto.key_for(params, passphrase), params, header_aad(self._preamble))
            if params is not None and passphrase is not None
            else None
        )
        self.consistent = consistent
        self.result: BackupResult | None = None

    def _records(self, counts: dict[str, int], recount: list[int]) -> Iterator[bytes]:
        yield settings_record(self._site)
        counts["settings"] += 1
        for stone in self._store.iter_tombstones(page=self._page):
            counts["tombstone"] += 1
            yield tombstone_record(stone.h, stone.at)
        for user in self._store.iter_users(page=self._page):
            counts["user"] += 1
            yield user_record(
                uid=user.uid,
                email=user.email,
                email_verified=user.email_verified,
                name=user.name,
                photo=user.photo,
                provider=user.provider,
                created_at=user.created_at,
                last_login_at=user.last_login_at,
            )
        for uid, hub, parts in self._store.iter_progress(page=self._page):
            recount[0] += 1
            for part in PARTS:
                out = parts.get(part)
                if out is None or out.gz is None:
                    continue
                raw = gzip.decompress(out.gz)
                recount[1] += len(raw)
                counts["progress"] += 1
                yield progress_record(uid, hub, part, out.upd, raw)

    def chunks(self) -> Iterator[bytes]:
        counts = {"settings": 0, "tombstone": 0, "user": 0, "progress": 0}
        recount = [0, 0]  # docs, payload bytes
        lines_sha = hashlib.sha256()
        file_sha = hashlib.sha256()
        total = 0
        deflate = zlib.compressobj(6, zlib.DEFLATED, 31)
        pending = bytearray()

        def emit(data: bytes) -> bytes:
            if self._framer is not None:
                data = self._framer.feed(data)
            return data

        def take(force: bool = False) -> bytes | None:
            nonlocal total
            if not pending or (len(pending) < CHUNK and not force):
                return None
            chunk = bytes(pending)
            pending.clear()
            total += len(chunk)
            if self._max is not None and total > self._max:
                raise BackupTooLarge(f"backup exceeds {self._max} bytes")
            file_sha.update(chunk)
            return chunk

        pending += self._preamble
        for line in self._records(counts, recount):
            lines_sha.update(line)
            pending += emit(deflate.compress(line))
            chunk = take()
            if chunk is not None:
                yield chunk
        pending += emit(deflate.compress(end_record(counts, lines_sha.hexdigest())))
        pending += emit(deflate.flush(zlib.Z_FINISH))
        if self._framer is not None:
            pending += self._framer.finish()
        chunk = take(force=True)
        if chunk is not None:
            yield chunk
        self.result = BackupResult(
            bytes=total,
            file_sha256=file_sha.hexdigest(),
            counts=counts,
            encrypted=self.encrypted,
            consistent=self.consistent,
            docs=recount[0],
            storage_bytes=recount[1],
        )
