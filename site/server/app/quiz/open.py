"""Open quizzes: every hub's topics as quizzes anyone can play at any time.

No room, no PIN, no host and no account: the browser fetches the questions, runs the game and
keeps the result (in the browser; signed-in players also sync it to their account through the
review-deck history). The questions are the hubs' own practice questions, which the public hub
pages already carry with their answers, so serving the answers to the browser reveals nothing new.

Level 1 is a hub's first three topics that have questions; level 2 the next three, and so on.
An admin can still host any of them as a live room or a self-paced challenge from the page.
"""

from __future__ import annotations

from typing import Any

TOPICS = 3  # topics per level
PER_TOPIC = 10  # at most this many questions from one topic
KEYS = 6  # key points shown per topic (and used as slides when hosted)


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


def _topics(hub: dict[str, Any]) -> list[dict[str, Any]]:
    """Every topic that has valid practice questions, in hub order."""
    out: list[dict[str, Any]] = []
    for m in hub.get("modules") or []:
        quiz = [q for q in m.get("quiz") or [] if _valid(q)]
        if quiz:
            out.append(
                {
                    "id": m.get("id"),
                    "title": m.get("title"),
                    "keys": [str(k) for k in (m.get("keys") or [])[:KEYS]],
                    "quiz": quiz[:PER_TOPIC],
                }
            )
    return out


def _levels(topics: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    return [topics[i : i + TOPICS] for i in range(0, len(topics), TOPICS)]


def open_index(bank: dict[str, Any]) -> list[dict[str, Any]]:
    """One entry per hub that has practice questions (`topics`/`questions` describe level 1)."""
    out = []
    for hub in bank.get("hubs") or []:
        levels = _levels(_topics(hub))
        if not levels:
            continue
        out.append(
            {
                "id": hub.get("id"),
                "slug": hub.get("slug"),
                "title": hub.get("title"),
                "code": hub.get("code"),
                "topics": [t["title"] for t in levels[0]],
                "questions": sum(len(t["quiz"]) for t in levels[0]),
                "levels": len(levels),
            }
        )
    return out


def open_quiz(bank: dict[str, Any], hub_id: str, level: int = 1) -> dict[str, Any] | None:
    hub = next((h for h in bank.get("hubs") or [] if h.get("id") == hub_id), None)
    if hub is None:
        return None
    levels = _levels(_topics(hub))
    if not 1 <= level <= len(levels):
        return None
    return {
        "id": hub.get("id"),
        "slug": hub.get("slug"),
        "title": hub.get("title"),
        "code": hub.get("code"),
        "level": level,
        "levels": len(levels),
        "firstTopic": (level - 1) * TOPICS + 1,
        "topics": levels[level - 1],
    }
