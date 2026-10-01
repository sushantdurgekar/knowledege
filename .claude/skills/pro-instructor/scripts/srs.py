#!/usr/bin/env python3
"""Spaced-repetition (SM-2) manager for the Knowledge vault deck (cards.jsonl).

Usage:
  python srs.py --deck-file cards.jsonl due [--deck aws-saa] [--track technical] [--limit 10] [--date YYYY-MM-DD]
  python srs.py --deck-file cards.jsonl add --json '{"id":"...","front":"...","back":"...","deck":"...","track":"technical"}'
  python srs.py --deck-file cards.jsonl add --json-file new_cards.json   # list of card objects
  python srs.py --deck-file cards.jsonl review <card_id> <grade 0-5> [--date YYYY-MM-DD]
  python srs.py --deck-file cards.jsonl stats [--deck aws-saa]

Grades: 5 instant, 4 correct w/ thought, 3 correct but shaky, 2 wrong but 'oh right', 1 wrong/familiar, 0 blank.
Standard library only.
"""
import argparse
import json
import sys
from datetime import date, timedelta
from pathlib import Path

DEFAULTS = {"ef": 2.5, "interval": 0, "reps": 0, "track": "technical", "tags": [], "lapses": 0}


def load(path: Path):
    cards = []
    if path.exists():
        for n, line in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), 1):
            line = line.strip()
            if not line:
                continue
            try:
                cards.append(json.loads(line))
            except json.JSONDecodeError as e:
                print(f"warning: skipping malformed line {n}: {e}", file=sys.stderr)
    return cards


def save(path: Path, cards):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text("".join(json.dumps(c, ensure_ascii=False) + "\n" for c in cards), encoding="utf-8")
    tmp.replace(path)


def sm2(card, grade, today):
    ef, interval, reps = card.get("ef", 2.5), card.get("interval", 0), card.get("reps", 0)
    if grade < 3:
        reps, interval = 0, 1
        card["lapses"] = card.get("lapses", 0) + 1
    else:
        reps += 1
        interval = 1 if reps == 1 else 6 if reps == 2 else round(interval * ef)
    ef = max(1.3, ef + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)))
    card.update(ef=round(ef, 3), interval=interval, reps=reps,
                due=(today + timedelta(days=interval)).isoformat(),
                last_review=today.isoformat(), last_grade=grade)
    return card


def filt(cards, a):
    return [c for c in cards
            if (not a.deck or c.get("deck") == a.deck) and (not a.track or c.get("track") == a.track)]


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--deck-file", required=True)
    sub = p.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("due"); d.add_argument("--deck"); d.add_argument("--track"); d.add_argument("--limit", type=int, default=0); d.add_argument("--date")
    ad = sub.add_parser("add"); ad.add_argument("--json"); ad.add_argument("--json-file"); ad.add_argument("--date")
    r = sub.add_parser("review"); r.add_argument("card_id"); r.add_argument("grade", type=int, choices=range(6)); r.add_argument("--date")
    s = sub.add_parser("stats"); s.add_argument("--deck"); s.add_argument("--track"); s.add_argument("--date")
    a = p.parse_args()

    path = Path(a.deck_file)
    today = date.fromisoformat(a.date) if getattr(a, "date", None) else date.today()
    cards = load(path)

    if a.cmd == "due":
        due = [c for c in filt(cards, a) if c.get("due", today.isoformat()) <= today.isoformat()]
        # most overdue + most lapsed first
        due.sort(key=lambda c: (c.get("due", ""), -c.get("lapses", 0)))
        if a.limit:
            due = due[: a.limit]
        print(json.dumps({"date": today.isoformat(), "due_count": len(due),
                          "cards": [{k: c.get(k) for k in ("id", "deck", "track", "front", "back", "lapses")} for c in due]},
                         ensure_ascii=False, indent=2))

    elif a.cmd == "add":
        new = []
        if a.json:
            obj = json.loads(a.json)
            new = obj if isinstance(obj, list) else [obj]
        elif a.json_file:
            obj = json.loads(Path(a.json_file).read_text(encoding="utf-8-sig"))
            new = obj if isinstance(obj, list) else [obj]
        ids = {c["id"] for c in cards}
        added = 0
        for c in new:
            if "id" not in c or "front" not in c or "back" not in c:
                print(f"skip (needs id/front/back): {c}", file=sys.stderr); continue
            if c["id"] in ids:
                print(f"skip duplicate id: {c['id']}", file=sys.stderr); continue
            card = {**DEFAULTS, **c}
            card.setdefault("due", today.isoformat())
            card.setdefault("created", today.isoformat())
            cards.append(card); ids.add(card["id"]); added += 1
        save(path, cards)
        print(json.dumps({"added": added, "total": len(cards)}))

    elif a.cmd == "review":
        for c in cards:
            if c["id"] == a.card_id:
                sm2(c, a.grade, today)
                save(path, cards)
                print(json.dumps({"id": c["id"], "next_due": c["due"], "interval": c["interval"], "ef": c["ef"]}))
                break
        else:
            sys.exit(f"card not found: {a.card_id}")

    elif a.cmd == "stats":
        sel = filt(cards, a)
        t = today.isoformat()
        mature = [c for c in sel if c.get("interval", 0) >= 21]
        print(json.dumps({
            "total": len(sel),
            "due_today": sum(1 for c in sel if c.get("due", t) <= t),
            "new": sum(1 for c in sel if c.get("reps", 0) == 0),
            "mature_21d_plus": len(mature),
            "leeches_3plus_lapses": [c["id"] for c in sel if c.get("lapses", 0) >= 3],
            "by_deck": {dk: sum(1 for c in sel if c.get("deck") == dk) for dk in sorted({c.get("deck") for c in sel})},
        }, indent=2))


if __name__ == "__main__":
    main()
