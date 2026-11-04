"""Live quiz rooms, kept in memory (one server process; a restart ends running rooms).

Flow: lobby -> question -> reveal -> question -> ... -> finished. The host moves it on; a
question also closes by itself when its time runs out or every player has answered.

Scoring: a fully correct answer earns between 50% and 100% of the question's points, more for
answering sooner (100% at once, 50% at the buzzer). Multi-select and match questions earn the
same, scaled by the share they got right (a wrong pick cancels a right one); "correct" means
all of it was right. Ties rank by total answer time, quicker first.

Sized for up to MAX_PLAYERS (250) players per room on one server process:
- Two change channels. `version` (host) moves on every change; `pversion` (players) only when
  something players see changes: a phase change, a kick, and the lobby head count (coalesced to
  at most one wake-up per LOBBY_COALESCE_S). So 250 answers wake the host, not 250 x 250 polls.
- Lookups are hash maps: player by token, nickname taken, answered-this-question counter, so a
  join or an answer is O(1) (no scans over the room).
- The ranking is sorted once per `version` (O(n log n), n <= 250) and cached with a rank index;
  the shared part of the player view is built once per `pversion`. A wake-up of all players is
  then O(n) small dict copies instead of n sorts.

Clients learn about changes by long-polling (one coroutine per waiting client, no threads).
"""

from __future__ import annotations

import asyncio
import contextlib
import random
import secrets
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Literal

from app.quiz.parse import Question, Quiz, normalise

Phase = Literal["lobby", "question", "reveal", "finished"]

MAX_ROOMS = 50
MAX_PLAYERS = 250
LOBBY_COALESCE_S = 1.0
MAX_NAME = 24
MAX_TEXT_ANSWER = 200
ROOM_IDLE_S = 6 * 3600
LEADERBOARD_SIZE = 10


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

    @property
    def correct(self) -> bool:
        return self.fraction >= 1.0


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


def _score(q: Question, value: Any, order: list[int]) -> float:
    """Share of the question answered correctly, 0..1. Raises QuizError for a malformed answer."""
    bad = QuizError(422, "invalid", "That answer does not fit this question")
    if q.type in ("single", "truefalse"):
        if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value < len(q.options):
            raise bad
        return 1.0 if value in q.correct else 0.0
    if q.type == "multi":
        if not isinstance(value, list) or not all(
            isinstance(v, int) and not isinstance(v, bool) for v in value
        ):
            raise bad
        picks = set(value)
        if not picks or any(not 0 <= v < len(q.options) for v in picks):
            raise bad
        right = set(q.correct)
        hits, misses = len(picks & right), len(picks - right)
        return max(0.0, (hits - misses) / len(right))
    if q.type == "text":
        if not isinstance(value, str) or not value.strip() or len(value) > MAX_TEXT_ANSWER:
            raise bad
        return 1.0 if any(a.matches(value) for a in q.answers) else 0.0
    # match: value[i] = index into the shuffled right-hand list shown to players, for left item i
    if not isinstance(value, list) or len(value) != len(q.pairs):
        raise bad
    if not all(isinstance(v, int) and not isinstance(v, bool) and 0 <= v < len(order) for v in value):
        raise bad
    hits = sum(1 for i, v in enumerate(value) if order[v] == i)
    return hits / len(q.pairs)


def _points(q: Question, fraction: float, elapsed: float) -> int:
    if fraction <= 0 or q.points <= 0:
        return 0
    speed = 1.0 - 0.5 * min(1.0, max(0.0, elapsed / q.time_limit))
    return round(q.points * fraction * speed)


class Room:
    def __init__(self, pin: str, quiz: Quiz, owner: str, clock: Callable[[], float]) -> None:
        self.pin = pin
        self.quiz = quiz
        self.owner = owner
        self.host_key = secrets.token_urlsafe(24)
        self.clock = clock
        self.players: dict[str, Player] = {}
        self.phase: Phase = "lobby"
        self.index = -1
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
        # Each match question shows its right-hand items in one shuffled order (same for all).
        self.orders: dict[int, list[int]] = {}
        for i, q in enumerate(quiz.questions):
            if q.type == "match":
                order = list(range(len(q.pairs)))
                while len(order) > 1 and order == sorted(order):
                    random.shuffle(order)
                self.orders[i] = order

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

    async def wait(self, since: int, timeout: float, *, host: bool = False) -> None:
        """Return when the channel's version > since, the open question's time runs out, or after timeout."""
        self.tick()
        if (self.version if host else self.pversion) > since:
            return
        if self.phase == "question":
            timeout = min(timeout, max(0.05, self.deadline - self.clock() + 0.05))
        event = self._event if host else self._pevent
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(event.wait(), timeout)
        self.tick()

    # -- state machine -------------------------------------------------------------------
    @property
    def question(self) -> Question | None:
        return self.quiz.questions[self.index] if 0 <= self.index < len(self.quiz.questions) else None

    def tick(self) -> None:
        """Close the open question once its time is up."""
        if self.phase == "question" and self.clock() >= self.deadline:
            self._reveal()

    def _open(self, index: int) -> None:
        self.index = index
        self.phase = "question"
        self.opened_at = self.clock()
        self.deadline = self.opened_at + self.question.time_limit  # type: ignore[union-attr]
        self.answered_count = 0
        self.bump()

    def _reveal(self) -> None:
        self.phase = "reveal"
        for player in self.players.values():
            answer = player.answers.get(self.index)
            player.streak = player.streak + 1 if answer is not None and answer.correct else 0
        self.bump()

    def act(self, action: str) -> None:
        self.tick()
        last = len(self.quiz.questions) - 1
        if action == "start" and self.phase == "lobby":
            self._open(0)
        elif action == "reveal" and self.phase == "question":
            self._reveal()
        elif action == "next" and self.phase == "reveal":
            if self.index < last:
                self._open(self.index + 1)
            else:
                self.phase = "finished"
                self.bump()
        elif action == "end" and self.phase != "finished":
            if self.phase == "question":
                self._reveal()
            self.phase = "finished"
            self.bump()
        else:
            raise QuizError(409, "conflict", f"Cannot {action} now (the room is at {self.phase})")

    # -- players -------------------------------------------------------------------------
    def join(self, name: str) -> Player:
        name = " ".join(name.split())[:MAX_NAME]
        if not name:
            raise QuizError(422, "invalid", "Enter a nickname")
        if self.phase == "finished":
            raise QuizError(409, "finished", "This quiz has ended")
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
            self.bump(players=False)  # a late joiner changes nothing other players see mid-question
        return player

    def player_by_token(self, token: str | None) -> Player:
        # A dict lookup by a 192-bit random token: the hash lookup leaks nothing useful.
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
        if self.index in player.answers and self.phase == "question":
            self.answered_count -= 1
        self.bump()

    def answer(self, player: Player, index: int, value: Any) -> Answer:
        self.tick()
        q = self.question
        if self.phase != "question" or index != self.index or q is None:
            raise QuizError(409, "closed", "This question is closed")
        if index in player.answers:
            raise QuizError(409, "answered", "You already answered this question")
        elapsed = max(0.0, self.clock() - self.opened_at)
        fraction = _score(q, value, self.orders.get(index, []))
        answer = Answer(value=value, elapsed=elapsed, fraction=fraction, points=_points(q, fraction, elapsed))
        player.answers[index] = answer
        player.score += answer.points
        player.time_total += elapsed
        player.correct += 1 if answer.correct else 0
        self.answered_count += 1
        if self.answered_count >= len(self.players):
            self._reveal()  # everyone is in: no need to wait for the clock
        else:
            self.bump(players=False)  # only the host's answered count moves
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

    def _question_view(self, host: bool) -> dict[str, Any] | None:
        q = self.question
        if q is None or self.phase in ("lobby",):
            return None
        view: dict[str, Any] = {
            "index": self.index,
            "text": q.text,
            "type": q.type,
            "timeLimit": q.time_limit,
            "points": q.points,
            "remainingMs": max(0, round((self.deadline - self.clock()) * 1000))
            if self.phase == "question"
            else 0,
        }
        if q.type in ("single", "multi", "truefalse"):
            view["options"] = q.options
            if q.type == "multi":
                view["pick"] = len(q.correct)
        elif q.type == "match":
            order = self.orders[self.index]
            view["left"] = [left for left, _ in q.pairs]
            view["right"] = [q.pairs[i][1] for i in order]
        if host or self.phase in ("reveal", "finished"):
            view["solution"] = self._solution(q)
            if q.explain:
                view["explain"] = q.explain
        if self.phase in ("reveal", "finished") or host:
            view["stats"] = self._stats(q)
        return view

    def _solution(self, q: Question) -> dict[str, Any]:
        if q.type in ("single", "multi", "truefalse"):
            return {"correct": q.correct}
        if q.type == "text":
            plain = [a.raw for a in q.answers if a.pattern is None]
            return {"accepted": plain or [a.raw for a in q.answers]}
        order = self.orders[self.index]
        return {"pairs": [order.index(i) for i in range(len(q.pairs))]}

    def _stats(self, q: Question) -> dict[str, Any]:
        answers = [p.answers[self.index] for p in self.players.values() if self.index in p.answers]
        stats: dict[str, Any] = {
            "answered": len(answers),
            "players": len(self.players),
            "correct": sum(1 for a in answers if a.correct),
        }
        if q.type in ("single", "truefalse"):
            counts = [0] * len(q.options)
            for a in answers:
                counts[a.value] += 1
            stats["counts"] = counts
        elif q.type == "multi":
            counts = [0] * len(q.options)
            for a in answers:
                for v in set(a.value):
                    counts[v] += 1
            stats["counts"] = counts
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

    def _base(self, host: bool) -> dict[str, Any]:
        ranked, _ = self._rank_index()
        out: dict[str, Any] = {
            "pin": self.pin,
            "title": self.quiz.title,
            "phase": self.phase,
            "version": self.version if host else self.pversion,
            "index": self.index,
            "total": len(self.quiz.questions),
            "playerCount": len(self.players),
            "question": self._question_view(host),
        }
        if self.phase in ("reveal", "finished") or host:
            out["leaderboard"] = self._board(ranked, len(ranked) if host else LEADERBOARD_SIZE)
        return out

    def view(self, player: Player | None = None, host: bool = False) -> dict[str, Any]:
        self.tick()
        if host:
            out = self._base(True)
            out["answeredCount"] = self.answered_count
            out["players"] = [
                {"id": p.id, "name": p.name, "score": p.score, "answered": self.index in p.answers}
                for p in self.players.values()  # dicts keep join order
            ]
            return out
        if self._pview is None or self._pview[0] != self.pversion:
            self._pview = (self.pversion, self._base(False))
        out = dict(self._pview[1])
        if out["question"] is not None and self.phase == "question":
            out["question"] = {
                **out["question"],
                "remainingMs": max(0, round((self.deadline - self.clock()) * 1000)),
            }
        if player is not None:
            _, ranks = self._rank_index()
            mine = player.answers.get(self.index)
            me: dict[str, Any] = {
                "id": player.id,
                "name": player.name,
                "score": player.score,
                "rank": ranks.get(player.id, len(ranks)),
                "correctCount": player.correct,
                "streak": player.streak,
                "answered": mine is not None,
            }
            if mine is not None:
                me["answer"] = mine.value
                if self.phase in ("reveal", "finished"):
                    me["lastPoints"] = mine.points
                    me["lastCorrect"] = mine.correct
                    me["lastFraction"] = round(mine.fraction, 3)
            out["me"] = me
        return out


class RoomManager:
    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self.clock = clock
        self.rooms: dict[str, Room] = {}

    def _sweep(self) -> None:
        now = self.clock()
        for pin, room in list(self.rooms.items()):
            if now - room.touched > ROOM_IDLE_S:
                del self.rooms[pin]

    def create(self, quiz: Quiz, owner: str) -> Room:
        self._sweep()
        if len(self.rooms) >= MAX_ROOMS:
            raise QuizError(429, "too_many_rooms", "Too many open rooms; end one first")
        while True:
            pin = f"{secrets.randbelow(900_000) + 100_000}"
            if pin not in self.rooms:
                break
        room = Room(pin, quiz, owner, self.clock)
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
