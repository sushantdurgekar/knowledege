"""Quizzes saved on the server, shared by every admin (the studio's library).

Stored as site settings documents, which every store backend (Firestore, Postgres, memory)
supports with version checks: `quiz-index` lists the quizzes; `quiz:<id>` holds one quiz in
the builder's JSON. A save sends the version it started from, so two admins editing the same
quiz cannot overwrite each other silently (409 conflict).
"""

from __future__ import annotations

import json
import re
import time
from typing import Any

from app.store.base import Conflict, Store

INDEX_KEY = "quiz-index"
MAX_QUIZZES = 500
MAX_DOC_BYTES = 300_000
ID_RE = re.compile(r"^[a-z0-9]{6,24}$")
ID_IMAGE = re.compile(r"^[a-f0-9]{24}$")


class LibraryError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def _key(quiz_id: str) -> str:
    if not ID_RE.fullmatch(quiz_id):
        raise LibraryError(422, "invalid", "Bad quiz id")
    return f"quiz:{quiz_id}"


def _summary(quiz_id: str, doc: dict[str, Any], updated: int, by: str) -> dict[str, Any]:
    items = doc.get("items") if isinstance(doc.get("items"), list) else []
    return {
        "id": quiz_id,
        "title": str(doc.get("title") or "Untitled quiz")[:200],
        "advanced": bool(doc.get("advanced")),
        "items": len(items),
        "questions": sum(1 for i in items if isinstance(i, dict) and i.get("type") != "slide"),
        "updated": updated,
        "by": by,
    }


def list_quizzes(store: Store) -> list[dict[str, Any]]:
    found = store.get_setting(INDEX_KEY)
    items = found[0].get("items", []) if found else []
    return sorted(items, key=lambda s: -int(s.get("updated", 0)))


def get_quiz(store: Store, quiz_id: str) -> tuple[dict[str, Any], int]:
    found = store.get_setting(_key(quiz_id))
    if found is None or not found[0].get("doc"):
        raise LibraryError(404, "not_found", "No such quiz")
    return found[0]["doc"], found[1]


def save_quiz(store: Store, quiz_id: str, doc: Any, expect: int | None, by: str) -> int:
    """Write a quiz (create when expect is None). Returns the new version."""
    key = _key(quiz_id)
    if not isinstance(doc, dict) or not isinstance(doc.get("items"), list):
        raise LibraryError(422, "invalid", "A quiz needs a title and a list of items")
    if len(json.dumps(doc, ensure_ascii=False)) > MAX_DOC_BYTES:
        raise LibraryError(413, "too_large", "This quiz is too large to save (300 KB)")
    current = store.get_setting(key)
    if current is not None and current[0].get("doc") and expect is None:
        raise LibraryError(409, "conflict", "A quiz with this id exists already")
    if current is not None and expect is not None and current[1] != expect:
        raise LibraryError(409, "conflict", "Someone else saved this quiz meanwhile; reload it first")
    now = int(time.time() * 1000)
    try:
        version = store.put_setting(
            key, {"doc": doc, "updated": now, "by": by}, expect_version=current[1] if current else 0
        )
    except Conflict:
        raise LibraryError(
            409, "conflict", "Someone else saved this quiz meanwhile; reload it first"
        ) from None
    _update_index(
        store, lambda items: [s for s in items if s.get("id") != quiz_id] + [_summary(quiz_id, doc, now, by)]
    )
    return version


def delete_quiz(store: Store, quiz_id: str) -> None:
    key = _key(quiz_id)
    current = store.get_setting(key)
    if current is not None:
        store.put_setting(key, {"doc": None, "deleted": int(time.time() * 1000)}, expect_version=current[1])
    _update_index(store, lambda items: [s for s in items if s.get("id") != quiz_id])


def _update_index(store: Store, change: Any) -> None:
    for _ in range(5):  # another admin may write the index at the same moment: retry
        found = store.get_setting(INDEX_KEY)
        items = found[0].get("items", []) if found else []
        items = change(items)
        if len(items) > MAX_QUIZZES:
            raise LibraryError(409, "full", f"The library holds at most {MAX_QUIZZES} quizzes")
        try:
            store.put_setting(INDEX_KEY, {"items": items}, expect_version=found[1] if found else 0)
            return
        except Conflict:  # re-read and try again
            continue
    raise LibraryError(409, "conflict", "The library is busy; try again")


# -- backups: the library travels inside the backup's settings record ---------------------------
STUDIO_MAX_BYTES = 6_000_000  # keeps that one record well under the reader's 8 MB line limit


def studio_snapshot(store: Store) -> dict[str, Any] | None:
    """Every saved quiz and the images they use, for a backup (None when the library is empty)."""
    index = list_quizzes(store)
    if not index:
        return None
    quizzes: list[dict[str, Any]] = []
    wanted: list[str] = []
    for entry in index:
        found = store.get_setting(_key(entry["id"]))
        if found is None or not found[0].get("doc"):
            continue
        doc = found[0]["doc"]
        quizzes.append(
            {"id": entry["id"], "doc": doc, "updated": found[0].get("updated"), "by": found[0].get("by")}
        )
        for item in doc.get("items") or []:
            image = item.get("image") if isinstance(item, dict) else None
            if isinstance(image, str) and image not in wanted:
                wanted.append(image)
    size = len(json.dumps(quizzes, ensure_ascii=False))
    images: dict[str, Any] = {}
    skipped = 0
    for image_id in wanted:
        found = store.get_setting(f"quiz-img:{image_id}")
        if found is None:
            continue
        cost = len(found[0].get("b64", "")) + 64
        if size + cost > STUDIO_MAX_BYTES:
            skipped += 1  # the quiz keeps its reference; the picture is left out of this backup
            continue
        images[image_id] = {"mime": found[0].get("mime"), "b64": found[0].get("b64")}
        size += cost
    return {"v": 1, "quizzes": quizzes, "images": images, "imagesSkipped": skipped}


def restore_studio(store: Store, studio: dict[str, Any], mode: str) -> dict[str, int]:
    """Write a backup's library back. Merge keeps quizzes that already exist; replace overwrites."""
    written = {"quizzes": 0, "images": 0}
    for image_id, image in (studio.get("images") or {}).items():
        if not (isinstance(image_id, str) and ID_IMAGE.fullmatch(image_id) and isinstance(image, dict)):
            continue
        if store.get_setting(f"quiz-img:{image_id}") is None and isinstance(image.get("b64"), str):
            store.put_setting(
                f"quiz-img:{image_id}", {"mime": image.get("mime"), "b64": image["b64"]}, expect_version=None
            )
            written["images"] += 1
    restored: list[dict[str, Any]] = []
    for entry in studio.get("quizzes") or []:
        quiz_id, doc = entry.get("id"), entry.get("doc")
        if not (isinstance(quiz_id, str) and ID_RE.fullmatch(quiz_id) and isinstance(doc, dict)):
            continue
        existing = store.get_setting(_key(quiz_id))
        if mode == "merge" and existing is not None and existing[0].get("doc"):
            continue
        updated = int(entry.get("updated") or time.time() * 1000)
        by = str(entry.get("by") or "")
        store.put_setting(_key(quiz_id), {"doc": doc, "updated": updated, "by": by}, expect_version=None)
        restored.append(_summary(quiz_id, doc, updated, by))
        written["quizzes"] += 1
    if restored:
        ids = {s["id"] for s in restored}
        if mode == "replace":  # the library becomes exactly the backup's
            _update_index(store, lambda items: list(restored))
        else:
            _update_index(store, lambda items: [s for s in items if s.get("id") not in ids] + restored)
    return written
