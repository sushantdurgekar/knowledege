#!/usr/bin/env python3
"""Bundle a staged vault delta into a session-pack zip (chat mode).

The staging dir mirrors the vault layout. A manifest.json is generated with a
merge mode per file:
  - append : practice/mistakes.jsonl and any *.append.md / *.append.jsonl
             (the '.append' marker is stripped from the target path)
  - write  : everything else (overwrite / create)

Usage:
  python make_session_pack.py <staging_dir> --message "learn(aws-saa): ..." --out pack.zip [--clear]
"""
import argparse
import json
import shutil
import zipfile
from datetime import datetime
from pathlib import Path

APPEND_ALWAYS = {"practice/mistakes.jsonl"}


def plan(rel: str):
    if rel in APPEND_ALWAYS:
        return rel, "append"
    for suf in (".append.md", ".append.jsonl"):
        if rel.endswith(suf):
            return rel[: -len(suf)] + suf.replace(".append", ""), "append"
    return rel, "write"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("staging")
    p.add_argument("--message", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--clear", action="store_true", help="empty the staging dir after packing")
    a = p.parse_args()

    root = Path(a.staging)
    files = sorted(f for f in root.rglob("*") if f.is_file() and f.name != "manifest.json")
    if not files:
        raise SystemExit("nothing staged")

    manifest = {
        "pack_id": datetime.now().strftime("%Y%m%d-%H%M%S"),
        "created": datetime.now().isoformat(timespec="seconds"),
        "commit_message": a.message,
        "files": [],
    }
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for f in files:
            rel = f.relative_to(root).as_posix()
            target, mode = plan(rel)
            z.write(f, f"payload/{rel}")
            manifest["files"].append({"src": f"payload/{rel}", "path": target, "mode": mode})
        z.writestr("manifest.json", json.dumps(manifest, indent=2))

    print(json.dumps({"pack": str(out), "files": len(files),
                      "append": [m["path"] for m in manifest["files"] if m["mode"] == "append"]}, indent=2))
    if a.clear:
        for child in root.iterdir():
            shutil.rmtree(child) if child.is_dir() else child.unlink()


if __name__ == "__main__":
    main()
