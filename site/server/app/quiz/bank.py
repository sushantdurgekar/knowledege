"""The hubs' practice questions, as the collector writes them (HUBS_DIR/quiz-bank.json).

{version, generatedAt, hubs: [{id, slug, title, code, modules: [{id, title, keys, quiz:
[{q, o, a, e}]}]}]}. Read lazily and kept until the file changes (a deploy).
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)
BANK_FILE = "quiz-bank.json"

_cache: tuple[Path, float, dict[str, Any]] | None = None


def load_bank(hubs_dir: Path) -> dict[str, Any]:
    global _cache
    path = Path(hubs_dir) / BANK_FILE
    try:
        mtime = path.stat().st_mtime
    except OSError:
        return {"hubs": []}
    if _cache is not None and _cache[0] == path and _cache[1] == mtime:
        return _cache[2]
    try:
        data = json.loads(path.read_text("utf-8"))
        hubs = data.get("hubs") if isinstance(data, dict) else None
        bank = {"hubs": hubs if isinstance(hubs, list) else []}
    except (OSError, ValueError):
        logger.warning("Quiz bank %s is unreadable", path)
        bank = {"hubs": []}
    _cache = (path, mtime, bank)
    return bank


def bank_index(bank: dict[str, Any]) -> list[dict[str, Any]]:
    """Hubs and modules with counts (no question text): the studio's picker."""
    return [
        {
            "id": h.get("id"),
            "title": h.get("title"),
            "code": h.get("code"),
            "modules": [
                {
                    "id": m.get("id"),
                    "title": m.get("title"),
                    "questions": len(m.get("quiz") or []),
                    "keys": len(m.get("keys") or []),
                }
                for m in h.get("modules") or []
            ],
        }
        for h in bank["hubs"]
    ]


def bank_hub(bank: dict[str, Any], hub_id: str) -> dict[str, Any] | None:
    return next((h for h in bank["hubs"] if h.get("id") == hub_id), None)
