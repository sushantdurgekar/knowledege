#!/usr/bin/env python3
"""Apply a study-hub bundle (made by the hub builder) to this Knowledge vault.

usage:
  python _meta/tools/apply_hub_bundle.py <bundle-dir or bundle.tgz> [--vault PATH] [--dry-run]

What it does (safe to run again after a rebuild of the same hub):
  1. Copies every file listed in _merge/manifest.json into the vault: the hub HTML, concept
     notes and lab briefs. Earlier copies from the same hub are overwritten.
  2. Merges _merge/interview.md into <subject>/interview.md and _merge/misconceptions.md into
     <subject>/misconceptions.md. A section for the same level is replaced, other sections are kept.
  3. Adds the hub's flashcards to practice/srs/cards.jsonl. New cards arrive parked
     (due 2099-12-31, "parked": true) so they don't flood your reviews. Cards that already exist
     keep their review history; only their front, back, source and tags are refreshed.

Afterwards:
  python _meta/tools/activate_deck.py <deck>     # when you start studying the hub
  python _meta/tools/build_index.py              # refresh INDEX.md
Standard library only (Python 3.8+).
"""
import argparse
import json
import re
import shutil
import sys
import tarfile
import tempfile
from datetime import date
from pathlib import Path

DECK_FILE = Path("practice/srs/cards.jsonl")
KEEP_ON_UPDATE = ("ef", "interval", "reps", "due", "lapses", "last_review", "last_grade", "parked", "created")


def safe_extract(tgz: Path, dest: Path):
    with tarfile.open(tgz, "r:gz") as tf:
        for m in tf.getmembers():
            target = (dest / m.name).resolve()
            if not str(target).startswith(str(dest.resolve())):
                sys.exit(f"refusing to extract {m.name}: it points outside the bundle")
            if m.issym() or m.islnk():
                sys.exit(f"refusing to extract link {m.name}")
        if hasattr(tarfile, "data_filter"):
            tf.extractall(dest, filter="data")
        else:
            tf.extractall(dest)


def merge_section(target: Path, new_text: str, title: str, subject: str, today: str, dry: bool):
    """Replace the '## <level label> (...)' section in target with new_text, or append it."""
    new_text = new_text.strip() + "\n"
    head = new_text.splitlines()[0]                       # e.g. "## L1 Foundation (2026-10-09)"
    m = re.match(r"^## (.+?) \(\d{4}-\d{2}-\d{2}\)$", head)
    label = m.group(1) if m else head[3:]
    if target.exists():
        old = target.read_text(encoding="utf-8")
        pat = re.compile(r"^## " + re.escape(label) + r" \(\d{4}-\d{2}-\d{2}\)\n.*?(?=^## |\Z)", re.S | re.M)
        if pat.search(old):
            out = pat.sub(lambda _: new_text + "\n", old, count=1)
            action = "replaced section"
        else:
            out = old.rstrip() + "\n\n" + new_text
            action = "appended section"
        out = re.sub(r"^updated: .*$", f"updated: {today}", out, count=1, flags=re.M)
    else:
        out = (f"---\ntitle: \"{title}\"\ntrack: technical\nsubject: {subject}\ncreated: {today}\nupdated: {today}\n---\n"
               f"# {title}\n\nSections are added by each hub level. Newest build replaces its own level's section.\n\n" + new_text)
        action = "created"
    print(f"  {action:16} {target}  [{label}]")
    if not dry:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(out.rstrip() + "\n", encoding="utf-8")


def load_cards(path: Path):
    cards = []
    if path.exists():
        for n, line in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), 1):
            line = line.strip()
            if line:
                try:
                    cards.append(json.loads(line))
                except json.JSONDecodeError as e:
                    sys.exit(f"{path}:{n} is not valid JSON ({e}); fix it before applying a bundle")
    return cards


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("bundle")
    ap.add_argument("--vault", default=".")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    vault = Path(a.vault).resolve()
    src = Path(a.bundle).resolve()
    tmp = None
    if src.is_file():
        tmp = Path(tempfile.mkdtemp(prefix="hubbundle_"))
        safe_extract(src, tmp)
        src = tmp
    try:
        man_path = src / "_merge" / "manifest.json"
        if not man_path.exists():
            sys.exit(f"no _merge/manifest.json in {src}: is this a hub bundle?")
        man = json.loads(man_path.read_text(encoding="utf-8"))
        today = date.today().isoformat()
        print(f"Hub {man['hub']} · {man['title']} → {vault}" + ("  (dry run)" if a.dry_run else ""))
        # 1. files
        for rel in man["files"]:
            s, d = src / rel, vault / rel
            if not s.exists():
                sys.exit(f"bundle is missing {rel}")
            same = d.exists() and d.read_bytes() == s.read_bytes()
            print(f"  {'unchanged' if same else ('updated' if d.exists() else 'added'):16} {rel}")
            if not a.dry_run and not same:
                d.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(s, d)
        # 2. merged sections
        subj = man["vault"]
        name = man["subject_name"]
        merge_section(vault / subj / "interview.md", (src / "_merge" / "interview.md").read_text(encoding="utf-8"),
                      f"{name}: interview questions", man["subject"], today, a.dry_run)
        merge_section(vault / subj / "misconceptions.md", (src / "_merge" / "misconceptions.md").read_text(encoding="utf-8"),
                      f"{name}: misconceptions and traps", man["subject"], today, a.dry_run)
        # 3. cards
        deck_path = vault / DECK_FILE
        cards = load_cards(deck_path)
        by_id = {c["id"]: c for c in cards}
        added = refreshed = 0
        for line in (src / "_merge" / "cards.jsonl").read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            c = json.loads(line)
            if c["id"] in by_id:
                old = by_id[c["id"]]
                for k, v in c.items():
                    if k not in KEEP_ON_UPDATE:
                        old[k] = v
                refreshed += 1
            else:
                cards.append(c)
                by_id[c["id"]] = c
                added += 1
        print(f"  cards            {added} added (parked), {refreshed} refreshed in {DECK_FILE} (deck {man['deck']})")
        if not a.dry_run:
            deck_path.parent.mkdir(parents=True, exist_ok=True)
            tmpf = deck_path.with_suffix(".tmp")
            tmpf.write_text("".join(json.dumps(c, ensure_ascii=False) + "\n" for c in cards), encoding="utf-8")
            tmpf.replace(deck_path)
        print("Next: python _meta/tools/activate_deck.py " + man["deck"] + " (when you start), then python _meta/tools/build_index.py")
    finally:
        if tmp:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
