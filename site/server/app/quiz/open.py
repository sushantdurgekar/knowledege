"""Open quizzes: every hub's first topics as a quiz anyone can play at any time.

No room, no PIN, no host and no account: the browser fetches the questions, runs the game and
keeps the result (in the browser; signed-in players also sync it to their account through the
review-deck history). The questions are the hubs' own practice questions, which the public hub
pages already carry with their answers, so serving the answers to the browser reveals nothing new.

An admin can still host the same quiz as a live room or a self-paced challenge from the page.
"""

from __future__ import annotations

from typing import Any

TOPICS = 3  # the first three topics that have practice questions
PER_TOPIC = 10  # at most this many questions from one topic
KEYS = 6  # key points shown per topic (and used as slides when hosted)


def _topics(hub: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for m in hub.get("modules") or []:
        quiz = [q for q in m.get("quiz") or [] if _valid(q)]
        if not quiz:
            continue
        out.append(
            {
                "id": m.get("id"),
                "title": m.get("title"),
                "keys": [str(k) for k in (m.get("keys") or [])[:KEYS]],
                "quiz": quiz[:PER_TOPIC],
            }
        )
        if len(out) == TOPICS:
            break
    return out


def _valid(q: Any) -> bool:
    if not isinstance(q, dict) or not isinstance(q.get("q"), str) or not q["q"].strip():
        return False
    options, answer = q.get("o"), q.get("a")
    return (
        isinstance(options, list)
        and 2 <= len(options) <= 8
        and all(isinstance(o, str) and o.strip() for o in options)
        and isinstance(answer, int)
        and not isinstance(answer, bool)
        and 0 <= answer < len(options)
    )


def open_index(bank: dict[str, Any]) -> list[dict[str, Any]]:
    """One entry per hub that has practice questions."""
    out = []
    for hub in bank.get("hubs") or []:
        topics = _topics(hub)
        if not topics:
            continue
        out.append(
            {
                "id": hub.get("id"),
                "slug": hub.get("slug"),
                "title": hub.get("title"),
                "code": hub.get("code"),
                "topics": [t["title"] for t in topics],
                "questions": sum(len(t["quiz"]) for t in topics),
            }
        )
    return out


def open_quiz(bank: dict[str, Any], hub_id: str) -> dict[str, Any] | None:
    hub = next((h for h in bank.get("hubs") or [] if h.get("id") == hub_id), None)
    if hub is None:
        return None
    topics = _topics(hub)
    if not topics:
        return None
    return {
        "id": hub.get("id"),
        "slug": hub.get("slug"),
        "title": hub.get("title"),
        "code": hub.get("code"),
        "topics": topics,
    }
