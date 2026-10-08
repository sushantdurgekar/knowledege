#!/usr/bin/env python3
"""Start studying a parked flashcard deck: spread its first reviews over the coming days.

usage:
  python _meta/tools/activate_deck.py <deck> [--per-day 8] [--start YYYY-MM-DD] [--deck-file PATH] [--dry-run]
  python _meta/tools/activate_deck.py --list

Hub bundles add their cards parked (due 2099-12-31) so new decks don't flood your daily reviews.
This un-parks a deck's cards in the order they were added (module order) and gives them first-review
dates of <per-day> cards a day from --start (default: today). Cards you've already reviewed are untouched.
Standard library only (Python 3.8+).
"""
import argparse
import json
import sys
from collections import Counter
from datetime import date, timedelta
from pathlib import Path


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("deck", nargs="?")
    ap.add_argument("--per-day", type=int, default=8)
    ap.add_argument("--start", default=date.today().isoformat())
    ap.add_argument("--deck-file", default="practice/srs/cards.jsonl")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--list", action="store_true", help="show decks and how many cards are parked")
    a = ap.parse_args()
    path = Path(a.deck_file)
    lines = path.read_text(encoding="utf-8-sig").splitlines()
    cards = [json.loads(l) for l in lines if l.strip()]
    if a.list or not a.deck:
        total, parked = Counter(), Counter()
        for c in cards:
            total[c.get("deck")] += 1
            parked[c.get("deck")] += 1 if c.get("parked") else 0
        for d in sorted(total, key=str):
            print(f"{d:24} {total[d]:4} cards, {parked[d]:4} parked")
        return
    if a.per_day < 1:
        sys.exit("--per-day must be at least 1")
    start = date.fromisoformat(a.start)
    todo = [c for c in cards if c.get("deck") == a.deck and c.get("parked")]
    if not todo:
        sys.exit(f"no parked cards in deck '{a.deck}' (try --list)")
    for i, c in enumerate(todo):
        c["due"] = (start + timedelta(days=i // a.per_day)).isoformat()
        c.pop("parked", None)
    last = todo[-1]["due"]
    print(f"{a.deck}: {len(todo)} cards activated, {a.per_day} a day from {start.isoformat()} to {last}" + (" (dry run)" if a.dry_run else ""))
    if not a.dry_run:
        tmp = path.with_suffix(".tmp")
        tmp.write_text("".join(json.dumps(c, ensure_ascii=False) + "\n" for c in cards), encoding="utf-8")
        tmp.replace(path)


if __name__ == "__main__":
    main()
