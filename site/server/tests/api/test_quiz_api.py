"""Live quiz: import format, scoring, and a room end to end through the API."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.clock import FixedClock
from app.quiz import routes as quiz_routes
from app.quiz.parse import TEMPLATE, QuizFormatError, parse_quiz
from app.quiz.room import Room, RoomManager
from tests.api.conftest import API
from tests.api.test_admin_api import ADMIN, session

SOURCE = """title: Demo
time: 10

Q: 2 + 2?
- 3
* 4

Q: Primes
* 2
* 3
- 4

Q: Capital of France?
answer: /^paris$/i

Q: Match
pair: a = 1
pair: b = 2
"""


def test_template_parses() -> None:
    quiz = parse_quiz(TEMPLATE)
    assert [q.type for q in quiz.questions] == ["single", "multi", "text", "truefalse", "match"]


@pytest.mark.parametrize(
    ("source", "message"),
    [
        ("", "no questions"),
        ("Q: x\n* a\n", "2-8 options"),
        ("Q: x\n- a\n- b\n", "add options|at least one"),
        ("Q: x\nanswer: /(/\n", "bad regular expression"),
        ("Q: x\npair: a\n", "pair lines"),
        ("Q: x\n* a\n* b\ntype: single\n", "exactly one"),
        ("Q: x\ntype: truefalse\nanswer: maybe\n", "truefalse"),
    ],
)
def test_format_errors(source: str, message: str) -> None:
    with pytest.raises(QuizFormatError, match=message):
        parse_quiz(source)


def test_room_scoring_and_flow() -> None:
    now = [0.0]
    room = Room("123456", parse_quiz(SOURCE), "boss", lambda: now[0])
    ann, bob = room.join("Ann"), room.join("Bob")
    room.act("start")
    room.answer(ann, 0, 1)  # right, at once: full points
    now[0] = 10.0
    room.tick()  # time is up: Bob gets nothing
    assert room.phase == "reveal"
    assert (ann.score, bob.score) == (1000, 0)
    room.act("next")
    room.answer(ann, 1, [0, 2])  # one right, one wrong -> 0
    room.answer(bob, 1, [0, 1])  # all right
    assert room.phase == "reveal"  # everyone answered
    assert bob.answers[1].correct
    assert ann.answers[1].points == 0
    room.act("next")
    room.answer(ann, 2, "  PARIS ")
    room.answer(bob, 2, "London")
    room.act("next")
    order = room.orders[3]
    room.answer(ann, 3, [order.index(0), order.index(1)])
    room.answer(bob, 3, [order.index(1), order.index(0)])
    assert ann.answers[3].correct
    assert bob.answers[3].points == 0
    room.act("next")
    assert room.phase == "finished"
    assert [p.name for p in room.ranking()] == ["Ann", "Bob"]


def test_player_view_hides_solution_until_reveal() -> None:
    room = Room("1", parse_quiz(SOURCE), "boss", lambda: 0.0)
    ann = room.join("Ann")
    room.join("Bob")
    room.act("start")
    assert "solution" not in room.view(player=ann)["question"]
    assert room.view(host=True)["question"]["solution"] == {"correct": [1]}
    room.act("reveal")
    assert room.view(player=ann)["question"]["solution"] == {"correct": [1]}


@pytest.fixture
def admin(make_client: Any, clock: FixedClock, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(quiz_routes, "_manager", RoomManager())
    client: TestClient = make_client(clock=clock, admin_emails=(ADMIN,))
    session(client)
    return client


def test_api_end_to_end(admin: TestClient) -> None:
    parsed = admin.post("/api/quiz/parse", json={"source": SOURCE}, headers=API).json()
    assert parsed["ok"]
    assert len(parsed["questions"]) == 4
    bad = admin.post("/api/quiz/parse", json={"source": "Q: x\n"}, headers=API).json()
    assert not bad["ok"]
    assert bad["errors"]

    created = admin.post("/api/quiz/rooms", json={"source": SOURCE}, headers=API)
    assert created.status_code == 201
    pin, key = created.json()["pin"], created.json()["hostKey"]
    host = {**API, "X-Quiz-Host": key}

    admin.cookies.clear()  # players need no account
    joined = admin.post(f"/api/quiz/rooms/{pin}/join", json={"name": "Ann"}, headers=API)
    assert joined.status_code == 201
    me = {**API, "X-Quiz-Token": joined.json()["token"]}
    assert admin.post(f"/api/quiz/rooms/{pin}/join", json={"name": "ann"}, headers=API).status_code == 409

    view = admin.get(f"/api/quiz/rooms/{pin}?since=0", headers=me).json()
    assert view["phase"] == "lobby"
    assert view["me"]["name"] == "Ann"
    assert admin.get(f"/api/quiz/rooms/{pin}/host", headers=API).status_code == 403

    started = admin.post(f"/api/quiz/rooms/{pin}/host/action", json={"action": "start"}, headers=host).json()
    assert started["phase"] == "question"
    assert started["question"]["solution"] == {"correct": [1]}
    answered = admin.post(f"/api/quiz/rooms/{pin}/answer", json={"index": 0, "answer": 1}, headers=me).json()
    assert answered["phase"] == "reveal"  # the only player answered
    assert answered["me"]["lastCorrect"] is True
    assert answered["me"]["score"] > 0
    again = admin.post(f"/api/quiz/rooms/{pin}/answer", json={"index": 0, "answer": 1}, headers=me)
    assert again.status_code == 409

    end = admin.post(f"/api/quiz/rooms/{pin}/host/action", json={"action": "end"}, headers=host).json()
    assert end["phase"] == "finished"
    assert end["leaderboard"][0]["name"] == "Ann"
    assert admin.post(f"/api/quiz/rooms/{pin}/host/action", json={"action": "close"}, headers=host).json()
    assert admin.get(f"/api/quiz/rooms/{pin}", headers=me).status_code == 404


def test_non_admin_cannot_create(make_client: Any, clock: FixedClock) -> None:
    client: TestClient = make_client(clock=clock, admin_emails=(ADMIN,))
    session(client, email="someone@example.com")
    assert client.post("/api/quiz/rooms", json={"source": SOURCE}, headers=API).status_code == 404


def test_full_room_250_players_is_cheap() -> None:
    """250 players: one wake-up per phase change for players, answers wake only the host."""
    import asyncio
    import time

    from app.quiz.room import MAX_PLAYERS, QuizError

    async def scenario() -> None:
        room = Room("1", parse_quiz(SOURCE), "boss", time.monotonic)
        players = [room.join(f"p{i}") for i in range(MAX_PLAYERS)]
        with pytest.raises(QuizError, match="full"):
            room.join("one too many")
        await asyncio.sleep(1.1)  # the coalesced lobby wake-up
        room.act("start")
        pv = room.pversion
        waiters = [asyncio.create_task(room.wait(pv, 5)) for _ in players]
        started = time.perf_counter()
        for i, p in enumerate(players[:-1]):
            room.answer(p, 0, i % 2)
            room.view(player=p)
        assert room.pversion == pv  # answers did not wake the players
        room.answer(players[-1], 0, 1)  # the last answer reveals
        await asyncio.gather(*waiters)
        views = [room.view(player=p) for p in players]
        elapsed = time.perf_counter() - started
        assert room.phase == "reveal"
        assert {v["me"]["rank"] for v in views} == set(range(1, MAX_PLAYERS + 1))
        assert elapsed < 1.0, elapsed  # a 250-player question costs milliseconds, not seconds

    asyncio.run(scenario())
