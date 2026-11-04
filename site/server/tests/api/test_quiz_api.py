"""Live quiz: import format, scoring, and a room end to end through the API."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.clock import FixedClock
from app.quiz import routes as quiz_routes
from app.quiz.parse import TEMPLATE, QuizFormatError, parse_quiz
from app.quiz.room import QuizError, Room, RoomManager
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
    assert [q.type for q in quiz.questions] == [
        "slide",
        "single",
        "multi",
        "text",
        "truefalse",
        "match",
        "order",
        "poll",
    ]


@pytest.mark.parametrize(
    ("source", "message"),
    [
        ("", "no questions"),
        ("Q: x\n* a\n", "2-8 options"),
        ("Q: x\n- a\n- b\n", "type: poll"),
        ("Q: x\nanswer: /(/\n", "bad regular expression"),
        ("Q: x\npair: a\n", "pairs look like"),
        ("Q: x\n* a\n* b\ntype: single\n", "exactly one"),
        ("Q: x\ntype: truefalse\nanswer: maybe\n", "true/false"),
        ("Q: x\nitem: a\n", "2-8 items"),
        ("Q: x\ntype: bogus\n* a\n- b\n", "type must be"),
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

    from app.quiz.room import MAX_PLAYERS

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
        assert elapsed < 3.0, elapsed  # a 250-player question costs milliseconds; 3 s leaves room for slow CI

    asyncio.run(scenario())


MIXED = """title: Mixed
Slide: Read this
Some body text.

- a bullet stays in the body

Q: Order these
item: one
item: two
item: three

Q: Feeling?
type: poll
- good
- bad
"""


def test_slide_poll_order_and_json_round_trip() -> None:
    from app.quiz.parse import quiz_from_json, quiz_to_json

    quiz = parse_quiz(MIXED)
    slide, order, poll = quiz.questions
    assert slide.type == "slide"
    assert slide.body == "Some body text.\n\n- a bullet stays in the body"
    assert (order.type, order.items) == ("order", ["one", "two", "three"])
    assert (poll.type, poll.points, poll.correct) == ("poll", 0, [])
    again = quiz_from_json(quiz_to_json(quiz))
    assert quiz_to_json(again) == quiz_to_json(quiz)
    template = quiz_from_json(quiz_to_json(parse_quiz(TEMPLATE)))
    assert [q.type for q in template.questions] == [q.type for q in parse_quiz(TEMPLATE).questions]
    with pytest.raises(QuizFormatError, match="item 1"):
        quiz_from_json({"title": "x", "items": [{"type": "single", "text": "q", "options": []}]})


def test_order_poll_slide_scoring_and_host_controls() -> None:
    now = [0.0]
    room = Room("1", parse_quiz(MIXED), "boss", lambda: now[0])
    ann, bob = room.join("Ann"), room.join("Bob")
    room.act("start")  # the slide: no timer, no answers
    assert room.view(host=True)["question"]["type"] == "slide"
    with pytest.raises(QuizError):
        room.answer(ann, 0, 0)
    room.act("goto", index=2)  # the host jumps to the poll, skipping the order question
    room.act("extend", seconds=30)
    assert room.deadline == 50.0
    room.answer(ann, 2, 0)
    room.answer(bob, 2, 1)
    assert room.phase == "reveal"
    assert (ann.score, room.view(host=True)["question"]["stats"]["counts"]) == (0, [1, 1])
    assert room.next_index() == 1  # the skipped item is still to run
    room.act("next")
    order = room.orders[1]
    right = [order.index(k) for k in range(3)]
    room.answer(ann, 1, right)
    room.answer(bob, 1, list(reversed(right)))
    assert ann.answers[1].correct
    assert 0 < bob.answers[1].fraction < 1 or bob.answers[1].fraction == 0
    room.act("lock")
    with pytest.raises(QuizError, match="locked"):
        room.join("Cy")
    room.act("next")  # nothing left: finished
    assert room.phase == "finished"
    assert room.cards()[0]["type"] == "slide"
    assert room.cards_open_to(ann)


def test_end_early_keeps_scores() -> None:
    now = [0.0]
    room = Room("1", parse_quiz(SOURCE), "boss", lambda: now[0])
    ann = room.join("Ann")
    room.join("Bob")
    room.act("start")
    room.answer(ann, 0, 1)
    room.act("end")  # mid-question: closes it and finishes, scores stand
    assert room.phase == "finished"
    assert ann.score == 1000
    assert room.view(player=ann)["leaderboard"][0]["name"] == "Ann"


def test_self_paced_room() -> None:
    from app.quiz.room import RoomManager

    now = [0.0]
    room = RoomManager(lambda: now[0]).create(parse_quiz(SOURCE), "boss", mode="self", study=True)
    ann, bob = room.join("Ann"), room.join("Bob")
    assert room.cards_open_to(ann)  # study rooms show flashcards before the start
    room.act("start")
    room.advance(ann)
    view = room.view(player=ann)
    assert (view["stage"], view["question"]["index"]) == ("question", 0)
    assert "solution" not in view["question"]
    room.answer(ann, 0, 1)
    assert room.view(player=ann)["question"]["solution"] == {"correct": [1]}
    room.advance(bob)
    now[0] = 11.0  # Bob's 10 s run out
    assert room.view(player=bob)["stage"] == "reveal"
    with pytest.raises(QuizError):
        room.answer(bob, 0, 1)
    for _ in range(3):
        room.advance(ann)
        q = room.view(player=ann)["question"]
        if q["type"] == "multi":
            room.answer(ann, q["index"], [0, 1])
        elif q["type"] == "text":
            room.answer(ann, q["index"], "paris")
        else:
            room.answer(ann, q["index"], [room.orders[3].index(k) for k in range(2)])
    room.advance(ann)
    assert room.view(player=ann)["stage"] == "done"
    host = room.view(host=True)
    assert host["players"][0]["answered"] == 4
    assert host["leaderboard"][0]["name"] == "Ann"
    room.act("end")
    assert room.view(player=bob)["stage"] == "done"


def test_api_builder_json_self_mode_and_cards(admin: TestClient) -> None:
    parsed = admin.post("/api/quiz/parse", json={"source": MIXED}, headers=API).json()
    assert parsed["ok"]
    assert parsed["quiz"]["items"][1]["items"] == ["one", "two", "three"]
    created = admin.post(
        "/api/quiz/rooms", json={"quiz": parsed["quiz"], "mode": "self", "study": True}, headers=API
    ).json()
    pin, key = created["pin"], created["hostKey"]
    admin.cookies.clear()
    token = admin.post(f"/api/quiz/rooms/{pin}/join", json={"name": "Ann"}, headers=API).json()["token"]
    me = {**API, "X-Quiz-Token": token}
    cards = admin.get(f"/api/quiz/rooms/{pin}/cards", headers=me).json()["cards"]
    assert [c["type"] for c in cards] == ["slide", "order"]  # polls have no card
    host = {**API, "X-Quiz-Host": key}
    assert (
        admin.post(f"/api/quiz/rooms/{pin}/host/action", json={"action": "start"}, headers=host).status_code
        == 200
    )
    view = admin.post(f"/api/quiz/rooms/{pin}/advance", headers=me).json()
    assert view["question"]["type"] == "slide"
    view = admin.post(f"/api/quiz/rooms/{pin}/advance", headers=me).json()
    assert view["question"]["type"] == "order"
    assert len(view["question"]["items"]) == 3
    bad = admin.post(f"/api/quiz/rooms/{pin}/answer", json={"index": 1, "answer": [0, 0, 1]}, headers=me)
    assert bad.status_code == 422
    good = admin.post(f"/api/quiz/rooms/{pin}/answer", json={"index": 1, "answer": [0, 1, 2]}, headers=me)
    assert good.json()["stage"] == "reveal"
    goto = admin.post(f"/api/quiz/rooms/{pin}/host/action", json={"action": "goto", "index": 1}, headers=host)
    assert goto.status_code == 409  # self-paced rooms have no host-driven items


def test_advanced_confidence_hints_explain_and_insights() -> None:
    from app.quiz.parse import ADVANCED_TEMPLATE

    now = [0.0]
    room = Room("1", parse_quiz(ADVANCED_TEMPLATE), "boss", lambda: now[0])
    ann, bob = room.join("Ann"), room.join("Bob")
    room.act("start")  # slide
    room.act("next")  # single, with a hint
    assert room.view(player=ann)["question"]["hintCount"] == 1
    assert room.hint(ann, 1) == ["The S stands for secure; it is not the plain web port."]
    room.answer(ann, 1, 1, "sure")  # right, one hint: 75% of the points
    room.answer(bob, 1, 0, "sure")  # wrong and sure: the dangerous quadrant
    assert ann.answers[1].points == 750
    insight = room.insights()[0]
    assert (insight["sureWrong"], insight["hintsUsed"], insight["topWrong"]["text"]) == (1, 1, "80")
    room.act("goto", index=3)  # teach-back
    room.answer(ann, 3, "TLS encrypts what TCP carries", "sure")
    room.answer(bob, 3, "no idea")
    responses = room.view(host=True)["question"]["stats"]["responses"]
    assert [r["name"] for r in responses] == ["Ann", "Bob"]
    assert ann.answers[3].confidence is None  # not scored: no confidence
    assert room.view(player=ann)["question"]["model"][0].startswith("TCP only")
    room.act("end")
    me = room.view(player=bob)["me"]
    assert me["calibration"] == {"sureRight": 0, "sureWrong": 1, "unsureRight": 0, "unsureWrong": 0}
    review = room.review(bob)
    assert [(r["type"], r["correct"]) for r in review] == [("single", False), ("order", False)]
    assert review[0]["solution"] == {"correct": [1]}


def test_simple_quiz_ignores_confidence_and_has_no_hints() -> None:
    room = Room("1", parse_quiz(SOURCE), "boss", lambda: 0.0)
    ann = room.join("Ann")
    room.act("start")
    with pytest.raises(QuizError, match="no hints"):
        room.hint(ann, 0)
    room.answer(ann, 0, 1, "sure")
    assert ann.answers[0].confidence is None


def test_library_bank_and_quiz_history_sync(admin: TestClient, tmp_path: Any) -> None:
    import json as _json

    from app.quiz import bank as bank_module

    doc = {
        "title": "Saved",
        "items": [
            {"type": "single", "text": "q", "options": [{"text": "a", "correct": True}, {"text": "b"}]}
        ],
    }
    put = admin.put("/api/quiz/library/abc12345", json={"doc": doc}, headers=API)
    assert put.status_code == 200
    version = put.json()["version"]
    listed = admin.get("/api/quiz/library", headers=API).json()["quizzes"]
    assert [(q["id"], q["title"], q["questions"]) for q in listed] == [("abc12345", "Saved", 1)]
    stale = admin.put("/api/quiz/library/abc12345", json={"doc": doc, "expect": version - 1}, headers=API)
    assert stale.status_code == 409
    again = admin.put(
        "/api/quiz/library/abc12345",
        json={"doc": {**doc, "title": "Renamed"}, "expect": version},
        headers=API,
    )
    assert again.status_code == 200
    assert admin.get("/api/quiz/library/abc12345", headers=API).json()["doc"]["title"] == "Renamed"
    assert admin.delete("/api/quiz/library/abc12345", headers=API).status_code == 200
    assert admin.get("/api/quiz/library", headers=API).json()["quizzes"] == []
    assert admin.get("/api/quiz/library/abc12345", headers=API).status_code == 404
    assert admin.put("/api/quiz/library/BAD!", json={"doc": doc}, headers=API).status_code == 422

    # The bank comes from HUBS_DIR/quiz-bank.json (written by the collector).
    hubs_dir = admin.app.state.studyhubs.settings.hubs_dir  # type: ignore[attr-defined]
    bank = {
        "hubs": [
            {
                "id": "h1",
                "title": "Hub",
                "modules": [
                    {
                        "id": "m1",
                        "title": "Mod",
                        "keys": ["k"],
                        "quiz": [{"q": "Q?", "o": ["a", "b"], "a": 0, "e": ""}],
                    }
                ],
            }
        ]
    }
    (hubs_dir / bank_module.BANK_FILE).write_text(_json.dumps(bank))
    index = admin.get("/api/quiz/bank", headers=API).json()["hubs"]
    assert index[0]["modules"][0]["questions"] == 1
    assert admin.get("/api/quiz/bank/h1", headers=API).json()["modules"][0]["quiz"][0]["q"] == "Q?"
    assert admin.get("/api/quiz/bank/nope", headers=API).status_code == 404

    # A signed-in player's quiz history syncs through the virtual "live-quiz" hub.
    now_ms = int(admin.app.state.studyhubs.runtime.clock.now_s() * 1000)  # type: ignore[attr-defined]
    body = {
        "hubs": {"live-quiz": {"main": {"hub": "live-quiz", "upd": now_ms, "S": {"deck": {}, "history": []}}}}
    }
    synced = admin.post("/api/sync", json=body, headers=API)
    assert synced.status_code == 200, synced.text
    got = admin.get("/api/progress/live-quiz", headers=API).json()
    assert got["parts"]["main"]["S"] == {"deck": {}, "history": []}
    hubs = admin.get("/api/me/progress", headers=API).json()["hubs"]
    assert any(h["hub"] == "live-quiz" and h["title"] == "Live quiz history" for h in hubs)


def test_presenter_and_public_board(admin: TestClient) -> None:
    created = admin.post("/api/quiz/rooms", json={"source": SOURCE}, headers=API).json()
    pin, key = created["pin"], created["hostKey"]
    host = {**API, "X-Quiz-Host": key}
    present_key = admin.get(f"/api/quiz/rooms/{pin}/host", headers=host).json()["presentKey"]
    admin.cookies.clear()
    token = admin.post(f"/api/quiz/rooms/{pin}/join", json={"name": "Ann"}, headers=API).json()["token"]
    me = {**API, "X-Quiz-Token": token}
    presenter = {**API, "X-Quiz-Present": present_key}
    assert admin.get(f"/api/quiz/rooms/{pin}/present", headers=API).status_code == 403
    assert (
        admin.get(f"/api/quiz/rooms/{pin}/present", headers={**API, "X-Quiz-Present": key}).status_code == 403
    )
    lobby = admin.get(f"/api/quiz/rooms/{pin}/present", headers=presenter).json()
    assert [p["name"] for p in lobby["players"]] == ["Ann"]
    admin.post(f"/api/quiz/rooms/{pin}/host/action", json={"action": "start"}, headers=host)
    open_ = admin.get(f"/api/quiz/rooms/{pin}/present", headers=presenter).json()
    assert open_["question"]["options"] == ["3", "4"]
    assert "solution" not in open_["question"]  # never before the reveal
    assert "presentKey" not in open_
    board = admin.get(f"/api/quiz/rooms/{pin}/board", headers=API).json()
    assert board["current"]["text"] == "2 + 2?"
    assert board["leaderboard"][0]["name"] == "Ann"
    admin.post(f"/api/quiz/rooms/{pin}/answer", json={"index": 0, "answer": 1}, headers=me)
    shown = admin.get(f"/api/quiz/rooms/{pin}/present", headers=presenter).json()
    assert shown["phase"] == "reveal"
    assert shown["question"]["solution"] == {"correct": [1]}
    assert shown["leaderboard"][0]["score"] > 0
