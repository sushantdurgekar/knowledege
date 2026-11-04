"""Quiz rooms, kept in memory (one server process; a restart ends running rooms).

Two modes:
  live  The host runs the room: lobby -> question -> reveal -> ... -> finished. The host picks
        which item comes next from the run sheet (any order), can add time, lock the room, and
        end at any point (scores stand as they are). A question also closes by itself when its
        time runs out or every player has answered. Slides have no timer and no answers.
  self  Self-paced: once the host opens it, each player moves through the items on their own,
        with their own timer per question. Optional flashcards ("study") before they start.

Scoring: a fully correct answer earns 50-100% of the question's points, more for answering
sooner. Multiple choice, match and order earn the same scaled by the share they got right
(multiple choice: a wrong pick cancels a right one). Polls and slides earn nothing. Ties rank
by total answer time, quicker first.

Sized for MAX_PLAYERS (250) per room on one process:
- Two change channels. `version` (host) moves on every change; `pversion` (players) only when
  players can see something new: a phase change, a kick, the lobby head count (coalesced to one
  wake-up per LOBBY_COALESCE_S). So 250 answers wake the host, not 250 x 250 long-polls.
- O(1) lookups: player by token, nickname taken, answered-this-question counter.
- The ranking is sorted once per `version` (n log n, n <= 250) and cached with a rank index; the
  shared part of the live player view is built once per `pversion`.
"""

from __future__ import annotations

import asyncio
import contextlib
import math
import random
import secrets
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Literal

from app.quiz.parse import Question, Quiz, answer_text, normalise

Phase = Literal["lobby", "question", "reveal", "finished"]
Mode = Literal["live", "self"]
Stage = Literal["ready", "question", "reveal", "done"]

MAX_PLAYERS = 250
MAX_NAME = 24
MAX_TEXT_ANSWER = 200
MAX_EXPLAIN = 600
CONFIDENCE = ("sure", "unsure")
ROOM_IDLE_S = 6 * 3600
LEADERBOARD_SIZE = 10
LOBBY_COALESCE_S = 1.0
MAX_RESPONSES = 250
MAX_EXTEND_S = 120


class QuizError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


@dataclass(slots=True)
class Answer:
    value: Any
    elapsed: float
    fraction: float
    points: int
    scored: bool = True
    confidence: str | None = None  # advanced quizzes: "sure" or "unsure"
    hints: int = 0

    @property
    def correct(self) -> bool:
        return self.scored and self.fraction >= 1.0


@dataclass(slots=True)
class Player:
    id: str
    name: str
    token: str
    score: int = 0
    time_total: float = 0.0
    correct: int = 0
    streak: int = 0
    joined: float = 0.0
    answers: dict[int, Answer] = field(default_factory=dict)
    hints_used: dict[int, int] = field(default_factory=dict)
    # self-paced progress
    index: int = -1
    stage: Stage = "ready"
    opened_at: float = 0.0
    deadline: float = 0.0


def _ints(value: Any, n: int, length: int | None = None) -> list[int] | None:
    if not isinstance(value, list) or (length is not None and len(value) != length):
        return None
    if not all(isinstance(v, int) and not isinstance(v, bool) and 0 <= v < n for v in value):
        return None
    return value


def score_answer(q: Question, value: Any, order: list[int]) -> float:
    """Share of the question answered correctly, 0..1. Raises QuizError for a malformed answer."""
    bad = QuizError(422, "invalid", "That answer does not fit this question")
    if q.type in ("single", "truefalse", "poll"):
        if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value < len(q.options):
            raise bad
        return 1.0 if value in q.correct else 0.0
    if q.type == "multi":
        picks = _ints(value, len(q.options))
        if not picks:
            raise bad
        right, chosen = set(q.correct), set(picks)
        return max(0.0, (len(chosen & right) - len(chosen - right)) / len(right))
    if q.type == "text":
        if not isinstance(value, str) or not value.strip() or len(value) > MAX_TEXT_ANSWER:
            raise bad
        return 1.0 if any(a.matches(value) for a in q.answers) else 0.0
    if q.type in ("match", "order"):
        # value[k] = index into the shuffled list players saw, placed at row k.
        size = len(q.pairs) if q.type == "match" else len(q.items)
        placed = _ints(value, size, size)
        if placed is None or len(set(placed)) != size:
            raise bad
        return sum(1 for k, v in enumerate(placed) if order[v] == k) / size
    if q.type == "explain":
        if not isinstance(value, str) or not value.strip() or len(value) > MAX_EXPLAIN:
            raise bad
        return 0.0  # teach-back is never scored
    raise bad  # slides take no answers


HINT_COST = 0.25


def points_for(q: Question, fraction: float, elapsed: float, hints: int = 0) -> int:
    if not q.scored or fraction <= 0:
        return 0
    speed = 1.0 - 0.5 * min(1.0, max(0.0, elapsed / q.time_limit))
    penalty = max(0.25, 1.0 - HINT_COST * hints)
    return round(q.points * fraction * speed * penalty)


def _shuffled(n: int) -> list[int]:
    order = list(range(n))
    while n > 1 and order == sorted(order):
        random.shuffle(order)
    return order


class Room:
    def __init__(
        self,
        pin: str,
        quiz: Quiz,
        owner: str,
        clock: Callable[[], float],
        *,
        mode: Mode = "live",
        study: bool = False,
    ) -> None:
        self.pin = pin
        self.quiz = quiz
        self.owner = owner
        self.mode: Mode = mode
        self.study = study
        self.host_key = secrets.token_urlsafe(24)
        self.clock = clock
        self.players: dict[str, Player] = {}
        self.phase: Phase = "lobby"
        self.locked = False
        self.index = -1
        self.done: set[int] = set()
        self.opened_at = 0.0
        self.deadline = 0.0
        self.version = 1  # host channel: every change
        self.pversion = 1  # player channel: what players see
        self.touched = clock()
        self.created = time.time()
        self._event = asyncio.Event()
        self._pevent = asyncio.Event()
        self._by_token: dict[str, Player] = {}
        self._names: set[str] = set()
        self.answered_count = 0
        self._lobby_pending = False
        self._ranked: tuple[int, list[Player], dict[str, int]] | None = None
        self._pview: tuple[int, dict[str, Any]] | None = None
        # Match and order items are shown in one shuffled order per question (same for all).
        self.orders: dict[int, list[int]] = {}
        for i, q in enumerate(quiz.questions):
            if q.type == "match":
                self.orders[i] = _shuffled(len(q.pairs))
            elif q.type == "order":
                self.orders[i] = _shuffled(len(q.items))

    @property
    def total(self) -> int:
        return len(self.quiz.questions)

    # -- change notification -------------------------------------------------------------
    def bump(self, players: bool = True) -> None:
        """Record a change; wake the host, and the players too when they can see it."""
        self.version += 1
        self.touched = self.clock()
        event, self._event = self._event, asyncio.Event()
        event.set()
        if players:
            self._bump_players()

    def _bump_players(self) -> None:
        self._lobby_pending = False
        self.pversion += 1
        event, self._pevent = self._pevent, asyncio.Event()
        event.set()

    def _bump_lobby(self) -> None:
        """Head-count changes in the lobby: at most one player wake-up per LOBBY_COALESCE_S."""
        self.bump(players=False)
        if self._lobby_pending:
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:  # no event loop (unit tests): wake at once
            self._bump_players()
            return
        self._lobby_pending = True
        loop.call_later(LOBBY_COALESCE_S, lambda: self._lobby_pending and self._bump_players())

    async def wait(
        self, since: int, timeout: float, *, host: bool = False, until: float | None = None
    ) -> None:
        """Return when the channel's version > since, a timer runs out, or after timeout."""
        self.tick()
        if (self.version if host else self.pversion) > since:
            return
        if self.phase == "question" and self.mode == "live" and math.isfinite(self.deadline):
            timeout = min(timeout, max(0.05, self.deadline - self.clock() + 0.05))
        if until is not None and math.isfinite(until):
            timeout = min(timeout, max(0.05, until - self.clock() + 0.05))
        event = self._event if host else self._pevent
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(event.wait(), timeout)
        self.tick()

    # -- live flow -----------------------------------------------------------------------
    @property
    def question(self) -> Question | None:
        return self.quiz.questions[self.index] if 0 <= self.index < self.total else None

    def tick(self) -> None:
        """Close the open live question once its time is up."""
        if self.mode == "live" and self.phase == "question" and self.clock() >= self.deadline:
            self._reveal()

    def _open(self, index: int) -> None:
        if not 0 <= index < self.total:
            raise QuizError(422, "invalid", "No such item")
        self.index = index
        self.done.add(index)
        self.phase = "question"
        self.opened_at = self.clock()
        q = self.quiz.questions[index]
        self.deadline = self.opened_at + q.time_limit if q.answerable else math.inf
        self.answered_count = 0
        self.bump()

    def _reveal(self) -> None:
        self.phase = "reveal"
        q = self.question
        if q is not None and q.scored:
            for player in self.players.values():
                answer = player.answers.get(self.index)
                player.streak = player.streak + 1 if answer is not None and answer.correct else 0
        self.bump()

    def next_index(self) -> int | None:
        """The next item not run yet: after the current one first, then from the top."""
        for i in [*range(self.index + 1, self.total), *range(0, self.index + 1)]:
            if i not in self.done:
                return i
        return None

    def _finish(self) -> None:
        if self.phase == "question" and self.mode == "live":
            self._reveal()
        self.phase = "finished"
        for player in self.players.values():
            player.stage = "done"
        self.bump()

    def act(self, action: str, *, index: int | None = None, seconds: int | None = None) -> None:
        self.tick()
        q = self.question
        between = self.phase == "reveal" or (self.phase == "question" and q is not None and not q.answerable)
        if action == "lock":
            self.locked = True
            self.bump(players=False)
        elif action == "unlock":
            self.locked = False
            self.bump(players=False)
        elif action == "end":
            if self.phase == "finished":
                raise QuizError(409, "conflict", "The quiz has already ended")
            self._finish()
        elif self.mode == "self":
            if action == "start" and self.phase == "lobby":
                self.phase = "question"  # running: players move on their own
                self.bump()
            else:
                raise QuizError(409, "conflict", f"Cannot {action} a self-paced room now")
        elif action == "start" and self.phase == "lobby":
            self._open(0 if index is None else index)
        elif action == "reveal" and self.phase == "question" and q is not None and q.answerable:
            self._reveal()
        elif action == "extend" and self.phase == "question" and q is not None and q.answerable:
            self.deadline += max(5, min(MAX_EXTEND_S, seconds or 10))
            self.bump()
        elif action in ("next", "goto") and (between or (action == "goto" and self.phase == "lobby")):
            target = self.next_index() if action == "next" or index is None else index
            if target is None:
                self._finish()
            else:
                self._open(target)
        else:
            raise QuizError(409, "conflict", f"Cannot {action} now (the room is at {self.phase})")

    # -- players -------------------------------------------------------------------------
    def join(self, name: str) -> Player:
        name = " ".join(name.split())[:MAX_NAME]
        if not name:
            raise QuizError(422, "invalid", "Enter a nickname")
        if self.phase == "finished":
            raise QuizError(409, "finished", "This quiz has ended")
        if self.locked:
            raise QuizError(409, "locked", "The host has locked this room")
        if len(self.players) >= MAX_PLAYERS:
            raise QuizError(409, "full", "This room is full")
        key = normalise(name)
        if key in self._names:
            raise QuizError(409, "name_taken", "Someone in this room already uses that nickname")
        player = Player(
            id=secrets.token_hex(6), name=name, token=secrets.token_urlsafe(24), joined=self.clock()
        )
        self.players[player.id] = player
        self._by_token[player.token] = player
        self._names.add(key)
        if self.phase == "lobby":
            self._bump_lobby()
        else:
            self.bump(players=False)  # a late joiner changes nothing other players see
        return player

    def player_by_token(self, token: str | None) -> Player:
        player = self._by_token.get(token or "")
        if player is None:
            raise QuizError(403, "not_joined", "Join the room first")
        return player

    def kick(self, player_id: str) -> None:
        player = self.players.pop(player_id, None)
        if player is None:
            raise QuizError(404, "not_found", "No such player")
        self._by_token.pop(player.token, None)
        self._names.discard(normalise(player.name))
        if self.mode == "live" and self.phase == "question" and self.index in player.answers:
            self.answered_count -= 1
        self.bump()

    def _record(
        self, player: Player, index: int, value: Any, elapsed: float, confidence: Any = None
    ) -> Answer:
        q = self.quiz.questions[index]
        fraction = score_answer(q, value, self.orders.get(index, []))
        hints = player.hints_used.get(index, 0)
        sure = confidence if self.quiz.advanced and q.scored and confidence in CONFIDENCE else None
        answer = Answer(
            value,
            elapsed,
            fraction,
            points_for(q, fraction, elapsed, hints),
            scored=q.scored,
            confidence=sure,
            hints=hints,
        )
        player.answers[index] = answer
        player.score += answer.points
        if q.scored:
            player.time_total += elapsed
            player.correct += 1 if answer.correct else 0
        return answer

    def current_for(self, player: Player) -> int | None:
        """The item this player can answer now, or None."""
        if self.mode == "self":
            self.self_tick(player)
            return player.index if self.phase == "question" and player.stage == "question" else None
        self.tick()
        return self.index if self.phase == "question" else None

    def hint(self, player: Player, index: int) -> list[str]:
        """Advanced quizzes: reveal the next hint for the open question (costs points)."""
        q = self.quiz.questions[index] if 0 <= index < self.total else None
        if not self.quiz.advanced or q is None or not q.hints:
            raise QuizError(409, "no_hints", "This question has no hints")
        if self.current_for(player) != index or index in player.answers:
            raise QuizError(409, "closed", "This question is closed")
        used = min(len(q.hints), player.hints_used.get(index, 0) + 1)
        player.hints_used[index] = used
        return q.hints[:used]

    def answer(self, player: Player, index: int, value: Any, confidence: Any = None) -> Answer:
        if self.mode == "self":
            return self._answer_self(player, index, value, confidence)
        self.tick()
        q = self.question
        if self.phase != "question" or index != self.index or q is None or not q.answerable:
            raise QuizError(409, "closed", "This question is closed")
        if index in player.answers:
            raise QuizError(409, "answered", "You already answered this question")
        answer = self._record(player, index, value, max(0.0, self.clock() - self.opened_at), confidence)
        self.answered_count += 1
        if self.answered_count >= len(self.players):
            self._reveal()  # everyone is in: no need to wait for the clock
        else:
            self.bump(players=False)  # only the host's answered count moves
        return answer

    # -- self-paced ----------------------------------------------------------------------
    def self_tick(self, player: Player) -> None:
        if player.stage == "question" and self.clock() >= player.deadline:
            player.stage = "reveal"  # time ran out: no answer, no points
            if self.quiz.questions[player.index].scored:
                player.streak = 0
            self.bump(players=False)

    def advance(self, player: Player) -> None:
        """Self-paced: open the player's next item (or finish them)."""
        if self.mode != "self" or self.phase != "question":
            raise QuizError(409, "conflict", "This room is not running self-paced")
        self.self_tick(player)
        if player.stage == "done":
            return
        if player.stage == "question" and self.quiz.questions[player.index].answerable:
            raise QuizError(409, "conflict", "Answer this question first")
        nxt = player.index + 1
        if nxt >= self.total:
            player.stage = "done"
        else:
            q = self.quiz.questions[nxt]
            player.index, player.stage = nxt, "question"
            player.opened_at = self.clock()
            player.deadline = player.opened_at + q.time_limit if q.answerable else math.inf
        self.bump(players=False)

    def _answer_self(self, player: Player, index: int, value: Any, confidence: Any = None) -> Answer:
        if self.phase != "question":
            raise QuizError(409, "closed", "This quiz is not running")
        self.self_tick(player)
        q = self.quiz.questions[player.index] if 0 <= player.index < self.total else None
        if player.stage != "question" or index != player.index or q is None or not q.answerable:
            raise QuizError(409, "closed", "This question is closed")
        answer = self._record(player, index, value, max(0.0, self.clock() - player.opened_at), confidence)
        if q.scored:
            player.streak = player.streak + 1 if answer.correct else 0
        player.stage = "reveal"
        self.bump(players=False)
        return answer

    # -- views ---------------------------------------------------------------------------
    def _rank_index(self) -> tuple[list[Player], dict[str, int]]:
        """Sorted once per version, then shared by every view at that version."""
        if self._ranked is None or self._ranked[0] != self.version:
            ranked = sorted(self.players.values(), key=lambda p: (-p.score, p.time_total, p.joined))
            self._ranked = (self.version, ranked, {p.id: i + 1 for i, p in enumerate(ranked)})
        return self._ranked[1], self._ranked[2]

    def ranking(self) -> list[Player]:
        return self._rank_index()[0]

    def _item_view(
        self, index: int, *, open_: bool, remaining_ms: int, host: bool, stats: bool
    ) -> dict[str, Any]:
        q = self.quiz.questions[index]
        view: dict[str, Any] = {
            "index": index,
            "text": q.text,
            "type": q.type,
            "timeLimit": q.time_limit if q.answerable else 0,
            "points": q.points,
            "remainingMs": remaining_ms if open_ else 0,
        }
        if q.type == "slide":
            view["body"] = q.body
        if q.type in ("single", "multi", "truefalse", "poll"):
            view["options"] = q.options
            if q.type == "multi":
                view["pick"] = len(q.correct)
        elif q.type == "match":
            view["left"] = [left for left, _ in q.pairs]
            view["right"] = [q.pairs[i][1] for i in self.orders[index]]
        elif q.type == "order":
            view["items"] = [q.items[i] for i in self.orders[index]]
        if self.quiz.advanced and q.hints:
            view["hintCount"] = len(q.hints)
            if host:
                view["hints"] = q.hints
        if (host or not open_) and q.answerable and q.type not in ("poll", "explain"):
            view["solution"] = self._solution(index)
            view["answerText"] = answer_text(q)
        if (host or not open_) and q.explain:
            view["explain"] = q.explain
        if (host or not open_) and q.type == "explain" and q.model:
            view["model"] = q.model
        if stats and q.answerable:
            view["stats"] = self._stats(index)
        return view

    def _solution(self, index: int) -> dict[str, Any]:
        q = self.quiz.questions[index]
        if q.type in ("single", "multi", "truefalse"):
            return {"correct": q.correct}
        if q.type == "text":
            plain = [a.raw for a in q.answers if a.pattern is None]
            return {"accepted": plain or [a.raw for a in q.answers]}
        order = self.orders[index]  # row k's item sits at display position order.index(k)
        return {"pairs" if q.type == "match" else "order": [order.index(k) for k in range(len(order))]}

    def _stats(self, index: int) -> dict[str, Any]:
        q = self.quiz.questions[index]
        answers = [p.answers[index] for p in self.players.values() if index in p.answers]
        stats: dict[str, Any] = {
            "answered": len(answers),
            "players": len(self.players),
            "correct": sum(1 for a in answers if a.correct),
        }
        if q.type in ("single", "truefalse", "poll", "multi"):
            counts = [0] * len(q.options)
            for a in answers:
                for v in set(a.value) if isinstance(a.value, list) else {a.value}:
                    counts[v] += 1
            stats["counts"] = counts
        elif q.type == "explain":
            stats["responses"] = [
                {"name": p.name, "text": str(p.answers[index].value)}
                for p in self.players.values()
                if index in p.answers
            ][:MAX_RESPONSES]
        elif q.type == "text":
            tally: dict[str, int] = {}
            for a in answers:
                key = " ".join(str(a.value).split())[:60]
                tally[key] = tally.get(key, 0) + 1
            stats["top"] = sorted(tally.items(), key=lambda kv: -kv[1])[:8]
        return stats

    def _board(self, ranked: list[Player], size: int) -> list[dict[str, Any]]:
        return [
            {
                "rank": i + 1,
                "id": p.id,
                "name": p.name,
                "score": p.score,
                "correct": p.correct,
                "streak": p.streak,
            }
            for i, p in enumerate(ranked[:size])
        ]

    def _common(self, host: bool) -> dict[str, Any]:
        return {
            "pin": self.pin,
            "title": self.quiz.title,
            "mode": self.mode,
            "study": self.study,
            "phase": self.phase,
            "version": self.version if host else self.pversion,
            "index": self.index,
            "total": self.total,
            "scoredTotal": sum(1 for q in self.quiz.questions if q.scored),
            "playerCount": len(self.players),
            "locked": self.locked,
            "advanced": self.quiz.advanced,
        }

    def _live_question(self, host: bool) -> dict[str, Any] | None:
        if self.question is None or self.phase == "lobby":
            return None
        open_ = self.phase == "question"
        remaining = 0
        if open_ and math.isfinite(self.deadline):
            remaining = max(0, round((self.deadline - self.clock()) * 1000))
        return self._item_view(
            self.index, open_=open_, remaining_ms=remaining, host=host, stats=host or not open_
        )

    def host_view(self) -> dict[str, Any]:
        self.tick()
        if self.mode == "self":
            for p in self.players.values():
                self.self_tick(p)
        ranked, _ = self._rank_index()
        out = self._common(True)
        out["answeredCount"] = self.answered_count
        out["leaderboard"] = self._board(ranked, len(ranked))
        if self.mode == "self" or self.phase in ("reveal", "finished"):
            out["insights"] = self.insights()
        out["sheet"] = [
            {"index": i, "type": q.type, "text": q.text[:120], "done": i in self.done, "points": q.points}
            for i, q in enumerate(self.quiz.questions)
        ]
        out["nextIndex"] = self.next_index()
        if self.mode == "live":
            out["question"] = self._live_question(True)
            out["players"] = [
                {"id": p.id, "name": p.name, "score": p.score, "answered": self.index in p.answers}
                for p in self.players.values()
            ]
        else:
            out["question"] = None
            out["players"] = [
                {
                    "id": p.id,
                    "name": p.name,
                    "score": p.score,
                    "answered": len(p.answers),
                    "position": p.index + 1,
                    "stage": p.stage,
                }
                for p in self.players.values()
            ]
            out["itemStats"] = [
                self._stats(i) if q.answerable else None for i, q in enumerate(self.quiz.questions)
            ]
        return out

    def view(self, player: Player | None = None, host: bool = False) -> dict[str, Any]:
        if host:
            return self.host_view()
        self.tick()
        if self.mode == "self":
            return self._self_view(player)
        if self._pview is None or self._pview[0] != self.pversion:
            base = self._common(False)
            base["question"] = self._live_question(False)
            if self.phase in ("reveal", "finished"):
                base["leaderboard"] = self._board(self.ranking(), LEADERBOARD_SIZE)
            self._pview = (self.pversion, base)
        out = dict(self._pview[1])
        if out["question"] is not None and self.phase == "question" and math.isfinite(self.deadline):
            out["question"] = {
                **out["question"],
                "remainingMs": max(0, round((self.deadline - self.clock()) * 1000)),
            }
        if player is not None:
            out["me"] = self._me(player, self.index)
        return out

    def _self_view(self, player: Player | None) -> dict[str, Any]:
        out = self._common(False)
        out["question"] = None
        if player is None:
            return out
        self.self_tick(player)
        if self.phase == "finished" or player.stage == "done":
            out["leaderboard"] = self._board(self.ranking(), LEADERBOARD_SIZE)
        if player.stage in ("question", "reveal") and 0 <= player.index < self.total:
            open_ = player.stage == "question"
            remaining = 0
            if open_ and math.isfinite(player.deadline):
                remaining = max(0, round((player.deadline - self.clock()) * 1000))
            out["question"] = self._item_view(
                player.index, open_=open_, remaining_ms=remaining, host=False, stats=False
            )
        out["index"] = player.index
        out["stage"] = player.stage
        out["me"] = self._me(player, player.index)
        return out

    def _me(self, player: Player, index: int) -> dict[str, Any]:
        _, ranks = self._rank_index()
        mine = player.answers.get(index)
        me: dict[str, Any] = {
            "id": player.id,
            "name": player.name,
            "score": player.score,
            "rank": ranks.get(player.id, len(ranks)),
            "correctCount": player.correct,
            "streak": player.streak,
            "answered": mine is not None,
        }
        closed = (
            self.phase in ("reveal", "finished")
            if self.mode == "live"
            else player.stage in ("reveal", "done")
        )
        q = self.quiz.questions[index] if 0 <= index < self.total else None
        if q is not None and q.hints and self.quiz.advanced:
            me["hints"] = q.hints[: player.hints_used.get(index, 0)]
        if mine is not None:
            me["answer"] = mine.value
            if closed:
                me["lastPoints"] = mine.points
                me["lastCorrect"] = mine.correct if mine.scored else None
                me["lastFraction"] = round(mine.fraction, 3)
                me["lastConfidence"] = mine.confidence
        if self.quiz.advanced and (self.phase == "finished" or player.stage == "done"):
            me["calibration"] = self.calibration(player)
        return me

    def calibration(self, player: Player) -> dict[str, int]:
        """Confidence vs result: sure-and-wrong is the most important to fix."""
        out = {"sureRight": 0, "sureWrong": 0, "unsureRight": 0, "unsureWrong": 0}
        for a in player.answers.values():
            if a.confidence is None or not a.scored:
                continue
            out[("sure" if a.confidence == "sure" else "unsure") + ("Right" if a.correct else "Wrong")] += 1
        return out

    def insights(self) -> list[dict[str, Any]]:
        """Per item, for the host: how hard it was and where players went wrong."""
        out: list[dict[str, Any]] = []
        for i, q in enumerate(self.quiz.questions):
            if not q.scored:
                continue
            answers = [p.answers[i] for p in self.players.values() if i in p.answers]
            row: dict[str, Any] = {
                "index": i,
                "type": q.type,
                "text": q.text[:120],
                "answered": len(answers),
                "correct": sum(1 for a in answers if a.correct),
                "avgSeconds": round(sum(a.elapsed for a in answers) / len(answers), 1) if answers else None,
                "sureWrong": sum(1 for a in answers if a.confidence == "sure" and not a.correct),
                "hintsUsed": sum(a.hints for a in answers),
            }
            if q.type in ("single", "truefalse"):
                wrong: dict[int, int] = {}
                for a in answers:
                    if not a.correct:
                        wrong[a.value] = wrong.get(a.value, 0) + 1
                if wrong:
                    pick, n = max(wrong.items(), key=lambda kv: kv[1])
                    row["topWrong"] = {"text": q.options[pick], "count": n}
            out.append(row)
        return out

    def review(self, player: Player) -> list[dict[str, Any]]:
        """Every question with its solution and this player's result: "replay my mistakes"."""
        out: list[dict[str, Any]] = []
        for i, q in enumerate(self.quiz.questions):
            if not q.scored:
                continue
            item = self._item_view(i, open_=False, remaining_ms=0, host=False, stats=False)
            mine = player.answers.get(i)
            item["correct"] = bool(mine and mine.correct)
            item["answered"] = mine is not None
            if q.type == "text":
                item["patterns"] = [a.raw for a in q.answers]
            out.append(item)
        return out

    def cards(self) -> list[dict[str, Any]]:
        """Flashcards: each slide as a reading card, each question with its answer."""
        out: list[dict[str, Any]] = []
        for q in self.quiz.questions:
            if q.type == "poll":
                continue
            card: dict[str, Any] = {"type": q.type, "front": q.text, "back": answer_text(q)}
            if q.type in ("single", "multi", "truefalse"):
                card["options"] = q.options
            if q.explain:
                card["explain"] = q.explain
            out.append(card)
        return out

    def cards_open_to(self, player: Player) -> bool:
        if self.phase == "finished" or player.stage == "done":
            return True
        return self.mode == "self" and self.study


class RoomManager:
    MAX_ROOMS = 50

    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self.clock = clock
        self.rooms: dict[str, Room] = {}

    def _sweep(self) -> None:
        now = self.clock()
        for pin, room in list(self.rooms.items()):
            if now - room.touched > ROOM_IDLE_S:
                del self.rooms[pin]

    def create(self, quiz: Quiz, owner: str, *, mode: Mode = "live", study: bool = False) -> Room:
        self._sweep()
        if len(self.rooms) >= self.MAX_ROOMS:
            raise QuizError(429, "too_many_rooms", "Too many open rooms; close one first")
        while True:
            pin = f"{secrets.randbelow(900_000) + 100_000}"
            if pin not in self.rooms:
                break
        room = Room(pin, quiz, owner, self.clock, mode=mode, study=study)
        self.rooms[pin] = room
        return room

    def get(self, pin: str) -> Room:
        room = self.rooms.get(pin.strip())
        if room is None:
            raise QuizError(404, "no_room", "No quiz is running with that PIN")
        return room

    def close(self, pin: str) -> None:
        room = self.rooms.pop(pin, None)
        if room is not None:
            room.bump()

    def owned_by(self, owner: str) -> list[Room]:
        self._sweep()
        return sorted((r for r in self.rooms.values() if r.owner == owner), key=lambda r: -r.created)
