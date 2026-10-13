"""The .backup writer on every store (build-contracts.md sections 20 and 22): a round trip
through `backup_tool.py verify` with exact counts and billing, and the Firestore emulator
streaming path, whose peak memory is measured in a fresh interpreter.
"""

from __future__ import annotations

import gzip
import json
import os
import secrets
import subprocess
import sys
import threading
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest

from app.backup.writer import BackupSource, BackupWriter
from app.config import SERVER_DIR, SITE_DIR
from app.store.base import PartIn, progress_doc_id
from tests.contract.conftest import EMULATOR, Adapter, make_firestore
from tests.contract.test_store_m2 import seed_progress, seed_users_and_tombstones

TOOL = SITE_DIR / "scripts" / "backup_tool.py"
AT = datetime(2026, 10, 12, 9, 30, tzinfo=UTC)
PASS = "correct horse battery staple"


def run_tool(*args: str, passphrase: str | None = None) -> subprocess.CompletedProcess[str]:
    env = {"PATH": os.environ.get("PATH", "")}
    if passphrase is not None:
        env["BACKUP_PASSPHRASE"] = passphrase
    return subprocess.run(  # noqa: S603 - our own interpreter and script
        [sys.executable, str(TOOL), *args],
        capture_output=True,
        text=True,
        timeout=300,
        env=env,
        check=False,
    )


def write(adapter: Adapter, out: Path, *, passphrase: str | None, page: int = 300) -> BackupWriter:
    writer = BackupWriter(
        adapter.store,
        source=BackupSource("t", "t", adapter.kind, None, "http://127.0.0.1:10000"),
        created_at=AT,
        site={"tz": "Asia/Kolkata", "notice": None},
        estimated={"user": 0, "progress": 0},
        consistent=True,
        passphrase=passphrase,
        page=page,
    )
    with out.open("wb") as f:
        for chunk in writer.chunks():
            f.write(chunk)
    return writer


class QueryPages:
    """Records the documents each run_query returned (Firestore only)."""

    def __init__(self, adapter: Adapter) -> None:
        self.sizes: list[int] = []
        self._lock = threading.Lock()
        api = adapter.api
        assert api is not None
        inner = api.run_query
        pages = self

        def run_query(request: Any = None, **kwargs: Any) -> Any:
            responses = inner(request=request, **kwargs)

            def counted() -> Any:
                docs = 0
                for response in responses:
                    if response._pb.HasField("document"):
                        docs += 1
                    yield response
                with pages._lock:
                    pages.sizes.append(docs)

            return counted()

        api.run_query = run_query  # type: ignore[method-assign]


@pytest.mark.parametrize("encrypted", [False, True], ids=["plain", "encrypted"])
def test_round_trip_counts_and_billing(fresh: Adapter, tmp_path: Path, encrypted: bool) -> None:
    docs = seed_progress(fresh, 700)  # 700 hub documents over 234 users' ids
    seed_users_and_tombstones(fresh, 250)
    lines = sum(len(parts) for parts in docs.values())
    pages = QueryPages(fresh) if fresh.api is not None else None
    before = fresh.counts()
    wire_before = fresh.wire_counts()

    out = tmp_path / "store.backup"
    writer = write(fresh, out, passphrase=PASS if encrypted else None, page=100)
    result = writer.result
    assert result is not None
    assert result.counts == {"settings": 1, "tombstone": 250, "user": 250, "progress": lines}
    assert result.docs == 700
    assert result.bytes == out.stat().st_size

    # 1 read per document; 700 ends on a full page, so that scan asks once more and the
    # empty answer bills 1 read; 250 ends on a partial page (no extra query).
    reads = fresh.counts()[0] - before[0]
    assert reads == 700 + 1 + 250 + 250
    assert fresh.wire_counts()[0] - wire_before[0] == reads
    if pages is not None:  # every query is one page of at most 100 documents
        assert max(pages.sizes) == 100
        assert sorted(pages.sizes) == sorted([100] * 7 + [0] + [100, 100, 50] * 2)

    verify = run_tool("verify", str(out), passphrase=PASS if encrypted else None)
    assert verify.returncode == 0, verify.stderr
    report = json.loads(verify.stdout)
    assert report["counts"] == result.counts
    assert report["encrypted"] is encrypted

    if encrypted:  # the wrong passphrase fails
        wrong = run_tool("verify", str(out), passphrase="not the passphrase!")
        assert wrong.returncode != 0


STREAM_SCRIPT = r"""
import json, resource, sys
from datetime import UTC, datetime
from app.backup.writer import BackupSource, BackupWriter
from app.store.firestore import FirestoreStore

project, host, out = sys.argv[1], sys.argv[2], sys.argv[3]
store = FirestoreStore(project_id=project, reset_at=lambda: datetime(2026, 10, 13, 7, tzinfo=UTC),
                       emulator_host=host)
store.ping()
before = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
writer = BackupWriter(store, source=BackupSource("t", "t", "firestore", project, "http://x"),
                      created_at=datetime(2026, 10, 12, tzinfo=UTC), site={"tz": "UTC", "notice": None},
                      estimated={"user": 0, "progress": 0}, consistent=False,
                      passphrase="correct horse battery staple")
with open(out, "wb") as f:
    for chunk in writer.chunks():
        f.write(chunk)
peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
store.close()
print(json.dumps({"peakKb": peak, "beforeKb": before, "counts": writer.result.counts,
                  "bytes": writer.result.bytes}))
"""

STREAM_DOCS = 5_000
PAYLOAD = 6_000  # bytes of incompressible text per part: ~60 MB of payloads in all


def test_firestore_emulator_streaming_path_memory(tmp_path: Path) -> None:
    """The Firestore path streams page by page: the writer's peak memory stays far below
    the data it backs up (two 6 KB parts on each of 5,000 documents)."""
    if not EMULATOR:
        pytest.skip("FIRESTORE_EMULATOR_HOST is not set")
    project = "demo-stream-" + secrets.token_hex(6)
    adapter = make_firestore(project)
    try:
        db = adapter.store.db  # type: ignore[attr-defined]
        for start in range(0, STREAM_DOCS, 250):
            batch = db.batch()
            for i in range(start, min(STREAM_DOCS, start + 250)):
                uid, hub = f"u{i // 2:05d}", ("ai103", "dsa-l1")[i % 2]
                fields: dict[str, Any] = {"uid": uid, "hub": hub, "done": 1}
                for name in ("main", "cards"):
                    raw = json.dumps({"hub": hub, "upd": i, "pad": secrets.token_hex(PAYLOAD // 2)}).encode()
                    p = PartIn(1_790_000_000_000 + i, gzip.compress(raw, mtime=0), len(raw), 1)
                    fields.update({f"u_{name}": p.upd, f"p_{name}": p.gz, f"n_{name}": p.raw_len})
                batch.set(db.collection("progress").document(progress_doc_id(uid, hub)), fields)
            batch.commit()

        out = tmp_path / "stream.backup"
        run = subprocess.run(  # noqa: S603 - our own interpreter and script
            [sys.executable, "-c", STREAM_SCRIPT, project, EMULATOR, str(out)],
            capture_output=True,
            text=True,
            cwd=SERVER_DIR,
            timeout=600,
            check=False,
        )
        assert run.returncode == 0, run.stderr
        report = json.loads(run.stdout)
        assert report["counts"]["progress"] == 2 * STREAM_DOCS
        total_mb = 2 * STREAM_DOCS * PAYLOAD / 1e6
        grown_mb = (report["peakKb"] - report["beforeKb"]) / 1024
        # Holding the scan would cost well over the payloads' 60 MB; a page costs a few MB.
        assert grown_mb < 40, (grown_mb, total_mb, report)
        assert report["peakKb"] / 1024 < 300, report

        verify = run_tool("verify", str(out), passphrase=PASS)
        assert verify.returncode == 0, verify.stderr
        assert json.loads(verify.stdout)["counts"]["progress"] == 2 * STREAM_DOCS
    finally:
        adapter.store.close()
        from tests.contract.conftest import _wipe_emulator

        _wipe_emulator(project)
