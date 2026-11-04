"""Restore uploads staged on disk (build-contracts.md section 24).

    DATA_DIR/restore/<uploadId>/
        meta.json         name, size, lastModified, state, received chunks and their sha256,
                          header summary, validation report or error (no passphrase, ever)
        upload.part       the file, each 4 MiB chunk written at its offset (pwrite)
        ready.ndjson.gz   the validated, decrypted records (written by validation)

States: uploading -> assembled (every chunk received) -> validating -> validated | invalid.
A chunk is idempotent (same index, same bytes: nothing changes); a changed chunk after
validation sends the upload back to `assembled`. One upload exists at a time: a second
`create` for the same file (name, size, lastModified) resumes it, any other is refused
until the first is deleted. Everything here is local to the instance: on a host whose
DATA_DIR is ephemeral (Render free), upload, validate and restore in one sitting.
"""

from __future__ import annotations

import contextlib
import hashlib
import json
import logging
import os
import re
import secrets
import shutil
import threading
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

CHUNK_SIZE = 4 * 1024 * 1024
MIN_SIZE = 16
MAX_NAME = 255
UPLOAD_ID_RE = re.compile(r"u[0-9a-f]{24}")
SHA_RE = re.compile(r"[0-9a-f]{64}")
STATES = ("uploading", "assembled", "validating", "validated", "invalid")


class UploadError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def not_found() -> UploadError:
    return UploadError(404, "not_found", "No such upload")


@dataclass
class Upload:
    id: str
    name: str
    size: int
    last_modified: int
    created_at: str
    state: str = "uploading"
    received: list[int] = field(default_factory=list)
    sha: dict[str, str] = field(default_factory=dict)  # chunk index -> sha256 hex
    header: dict[str, Any] | None = None
    report: dict[str, Any] | None = None
    error: str | None = None

    @property
    def chunks(self) -> int:
        return max(1, -(-self.size // CHUNK_SIZE))

    def chunk_length(self, n: int) -> int:
        return min(CHUNK_SIZE, self.size - n * CHUNK_SIZE)

    def same_file(self, name: str, size: int, last_modified: int) -> bool:
        return (self.name, self.size, self.last_modified) == (name, size, last_modified)

    def to_json(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "uploadId": self.id,
            "name": self.name,
            "size": self.size,
            "lastModified": self.last_modified,
            "chunkSize": CHUNK_SIZE,
            "chunks": self.chunks,
            "createdAt": self.created_at,
            "state": self.state,
            "received": sorted(self.received),
        }
        if self.header is not None:
            out["header"] = self.header
        if self.report is not None:
            out["report"] = self.report
        if self.error is not None:
            out["error"] = self.error
        return out


class Uploads:
    def __init__(self, data_dir: Path, *, max_bytes: int) -> None:
        self.root = Path(data_dir) / "restore"
        self.max_bytes = max_bytes
        self._lock = threading.RLock()

    # -- paths ------------------------------------------------------------------------------

    def _dir(self, upload_id: str) -> Path:
        if not isinstance(upload_id, str) or UPLOAD_ID_RE.fullmatch(upload_id) is None:
            raise not_found()
        return self.root / upload_id

    def part_path(self, upload_id: str) -> Path:
        return self._dir(upload_id) / "upload.part"

    def ready_path(self, upload_id: str) -> Path:
        return self._dir(upload_id) / "ready.ndjson.gz"

    # -- metadata -----------------------------------------------------------------------------

    def _load(self, upload_id: str) -> Upload:
        path = self._dir(upload_id) / "meta.json"
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (FileNotFoundError, NotADirectoryError):
            raise not_found() from None
        except (OSError, ValueError):
            logger.warning("Restore upload %s has unreadable metadata", upload_id)
            raise not_found() from None
        return Upload(**data)

    def _save(self, upload: Upload) -> None:
        directory = self._dir(upload.id)
        tmp = directory / "meta.json.tmp"
        tmp.write_text(json.dumps(asdict(upload), separators=(",", ":")), encoding="utf-8")
        tmp.replace(directory / "meta.json")

    def get(self, upload_id: str) -> Upload:
        with self._lock:
            return self._load(upload_id)

    def all(self) -> list[Upload]:
        with self._lock:
            if not self.root.is_dir():
                return []
            out = []
            for entry in sorted(self.root.iterdir()):
                if entry.is_dir() and UPLOAD_ID_RE.fullmatch(entry.name):
                    with contextlib.suppress(UploadError):
                        out.append(self._load(entry.name))
            return out

    # -- create, chunks, delete -----------------------------------------------------------------

    def create(self, name: Any, size: Any, last_modified: Any, *, now_iso: str) -> tuple[Upload, bool]:
        """A new upload, or the existing one for the same file (resume). (upload, created)."""
        if not isinstance(name, str) or not name.strip() or len(name) > MAX_NAME:
            raise UploadError(422, "invalid", f"name must be a file name of at most {MAX_NAME} characters")
        if not isinstance(size, int) or isinstance(size, bool) or size < MIN_SIZE:
            raise UploadError(422, "invalid", "size must be the file size in bytes")
        if not isinstance(last_modified, int) or isinstance(last_modified, bool) or last_modified < 0:
            raise UploadError(422, "invalid", "lastModified must be a timestamp in ms")
        if size > self.max_bytes:
            raise UploadError(413, "too_large", f"Backups larger than {self.max_bytes} bytes are refused")
        with self._lock:
            for existing in self.all():
                if existing.same_file(name, size, last_modified):
                    return existing, False
                raise UploadError(
                    409, "busy", "Another upload is in progress; delete it first (one upload at a time)"
                )
            self.root.mkdir(parents=True, exist_ok=True)
            free = shutil.disk_usage(self.root).free
            if free < 2 * size + CHUNK_SIZE:  # the upload and its decrypted copy
                raise UploadError(507, "no_space", "Not enough disk space in DATA_DIR for this backup")
            upload = Upload(
                id="u" + secrets.token_hex(12),
                name=name.strip(),
                size=size,
                last_modified=last_modified,
                created_at=now_iso,
            )
            directory = self._dir(upload.id)
            directory.mkdir(mode=0o700)
            with self.part_path(upload.id).open("wb") as f:
                f.truncate(size)
            self._save(upload)
            return upload, True

    def put_chunk(self, upload_id: str, n: int, body: bytes, sha_hex: str | None) -> Upload:
        with self._lock:
            upload = self._load(upload_id)
            if upload.state == "validating":
                raise UploadError(409, "busy", "The upload is being validated")
            if not 0 <= n < upload.chunks:
                raise UploadError(422, "invalid", f"chunk must be 0-{upload.chunks - 1}")
            if not isinstance(sha_hex, str) or SHA_RE.fullmatch(sha_hex.strip().lower()) is None:
                raise UploadError(422, "invalid", "X-Chunk-SHA256 must be the chunk's sha256 in hex")
            want = sha_hex.strip().lower()
            if len(body) != upload.chunk_length(n):
                raise UploadError(
                    422, "invalid", f"chunk {n} must be {upload.chunk_length(n)} bytes, got {len(body)}"
                )
            if hashlib.sha256(body).hexdigest() != want:
                raise UploadError(422, "checksum", f"chunk {n} does not match its X-Chunk-SHA256")
            key = str(n)
            if upload.sha.get(key) == want and n in upload.received:
                return upload  # a repeat: already stored
            fd = os.open(self.part_path(upload_id), os.O_WRONLY)
            try:
                os.pwrite(fd, body, n * CHUNK_SIZE)
                os.fsync(fd)
            finally:
                os.close(fd)
            upload.sha[key] = want
            if n not in upload.received:
                upload.received.append(n)
                upload.received.sort()
            if upload.state in ("validated", "invalid"):  # the file changed: validate again
                self.ready_path(upload_id).unlink(missing_ok=True)
                upload.report = None
                upload.error = None
            upload.state = "assembled" if len(upload.received) == upload.chunks else "uploading"
            self._save(upload)
            return upload

    def delete(self, upload_id: str) -> None:
        with self._lock:
            directory = self._dir(upload_id)
            if not directory.is_dir():
                raise not_found()
            shutil.rmtree(directory, ignore_errors=True)

    def discard(self, upload_id: str) -> None:
        """Delete if present (a finished restore cleans up after itself; safe to repeat)."""
        with contextlib.suppress(UploadError):
            self.delete(upload_id)

    # -- validation state -----------------------------------------------------------------------

    def begin_validation(self, upload_id: str) -> Upload:
        with self._lock:
            upload = self._load(upload_id)
            if upload.state == "uploading":
                missing = upload.chunks - len(upload.received)
                raise UploadError(409, "incomplete", f"The upload is missing {missing} chunk(s)")
            if upload.state == "validating":
                raise UploadError(409, "busy", "The upload is already being validated")
            upload.state = "validating"
            upload.report = None
            upload.error = None
            self.ready_path(upload_id).unlink(missing_ok=True)
            self._save(upload)
            return upload

    def finish_validation(
        self,
        upload_id: str,
        *,
        report: dict[str, Any] | None,
        error: str | None,
        header: dict[str, Any] | None = None,
    ) -> None:
        with self._lock:
            try:
                upload = self._load(upload_id)
            except UploadError:
                return  # deleted meanwhile
            upload.state = "invalid" if error else "validated"
            upload.report = report
            upload.error = error
            if header is not None:
                upload.header = header
            if error:
                self.ready_path(upload_id).unlink(missing_ok=True)
            self._save(upload)

    def recover(self) -> None:
        """At boot: a validation the last process did not finish is marked invalid (retry it)."""
        with self._lock:
            for upload in self.all():
                if upload.state == "validating":
                    self.finish_validation(
                        upload.id, report=None, error="validation was interrupted; run it again"
                    )
