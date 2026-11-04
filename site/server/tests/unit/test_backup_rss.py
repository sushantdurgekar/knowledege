"""A backup of 20k synthetic progress documents stays under 300 MB peak RSS (memory store).

The backup runs in a fresh interpreter so the peak (`ru_maxrss`) is the writer's own,
not whatever this pytest process allocated before. The file is then checked with
`backup_tool.py verify`.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from app.config import SERVER_DIR, SITE_DIR

DOCS = 20_000
LIMIT_MB = 300

SCRIPT = r"""
import gzip, json, random, resource, sys
from datetime import UTC, datetime
from app.backup.writer import BackupSource, BackupWriter
from app.store.base import PartIn, UserRecord
from app.store.memory import MemoryStore

docs, out = int(sys.argv[1]), sys.argv[2]
rng = random.Random(5)
store = MemoryStore()
now = datetime(2026, 10, 12, tzinfo=UTC)
hubs = ["ai103", "dsa-l1", "ai901", "az-104", "sql-l2"]
for i in range(docs):
    uid, hub = f"user-{i // 5:06d}", hubs[i % 5]
    if i % 5 == 0:
        store.upsert_user(UserRecord(uid, uid + "@example.com", True, "Name", None, "google.com",
                                     last_login_at=now), touch_login=True)
    upd = 1_790_000_000_000 + i
    state = {"v": 2, "done": {f"m{k}": True for k in range(rng.randrange(40))},
             "quiz": {f"q{k}": rng.randrange(4) for k in range(60)}, "note": "x" * rng.randrange(400)}
    main = json.dumps({"hub": hub, "upd": upd, "S": state}, separators=(",", ":")).encode()
    cards = json.dumps({"hub": hub, "upd": upd, "map": {f"c{k}": {"due": k} for k in range(30)}},
                       separators=(",", ":")).encode()
    store.put_parts(uid, hub, {"main": PartIn(upd, gzip.compress(main), len(main), 1),
                               "cards": PartIn(upd, gzip.compress(cards), len(cards), None)}, upd)
before = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
writer = BackupWriter(store, source=BackupSource("t", "t", "memory", None, "http://x"), created_at=now,
                      site={"tz": "Asia/Kolkata", "notice": None},
                      estimated={"user": docs // 5, "progress": docs},
                      consistent=True, passphrase="correct horse battery")
with open(out, "wb") as f:
    for chunk in writer.chunks():
        f.write(chunk)
peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
print(json.dumps({"peakKb": peak, "beforeKb": before, "result": writer.result.counts}))
"""


def test_20k_doc_backup_peak_rss(tmp_path: Path) -> None:
    out = tmp_path / "big.backup"
    run = subprocess.run(  # noqa: S603 - our own interpreter and script
        [sys.executable, "-c", SCRIPT, str(DOCS), str(out)],
        capture_output=True,
        text=True,
        cwd=SERVER_DIR,
        timeout=300,
        check=False,
    )
    assert run.returncode == 0, run.stderr
    report = json.loads(run.stdout)
    assert report["result"]["progress"] == 2 * DOCS
    peak_mb = report["peakKb"] / 1024  # Linux reports kilobytes
    assert peak_mb < LIMIT_MB, report
    # The writer itself adds little on top of the populated store (one page + 2 MiB).
    assert (report["peakKb"] - report["beforeKb"]) / 1024 < 32, report
    verify = subprocess.run(  # noqa: S603
        [sys.executable, str(SITE_DIR / "scripts" / "backup_tool.py"), "verify", str(out)],
        capture_output=True,
        text=True,
        timeout=300,
        env={"BACKUP_PASSPHRASE": "correct horse battery", "PATH": ""},
        check=False,
    )
    assert verify.returncode == 0, verify.stderr
    assert json.loads(verify.stdout)["counts"]["progress"] == 2 * DOCS
