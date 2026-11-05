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
    # The host's export: every card with its index, plus the room's results per item.
    export = admin.get(f"/api/quiz/rooms/{pin}/host/cards", headers=host).json()
    assert [(c["index"], c["type"]) for c in export["cards"]] == [(0, "slide"), (1, "order")]
    assert (export["insights"][0]["index"], export["insights"][0]["answered"]) == (1, 1)
    assert admin.get(f"/api/quiz/rooms/{pin}/host/cards", headers=me).status_code == 403


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


def test_room_survives_a_restart_mid_question() -> None:
    """Save a running room to the store, restore it in a "new process", keep playing."""
    from app.quiz.persist import RoomSaver, pack, room_state, unpack
    from app.store.memory import MemoryStore

    now = [100.0]
    manager = RoomManager(lambda: now[0])
    room = manager.create(parse_quiz(SOURCE), "boss", teams=2)
    ann, bob = room.join("Ann"), room.join("Bob")
    room.act("start")
    room.answer(ann, 0, 1, None)
    now[0] = 103.0  # 3 s into a 10 s question
    store = MemoryStore()
    RoomSaver(manager, store).flush(force=True)
    assert unpack(pack(room_state(room)))["players"][0]["name"] == "Ann"

    later = [5000.0]  # a new process: monotonic time starts elsewhere
    fresh = RoomManager(lambda: later[0])
    assert RoomSaver(fresh, store).load() == 1
    again = fresh.get(room.pin)
    assert again.host_key == room.host_key
    assert again.present_key == room.present_key
    assert again.player_by_token(bob.token).name == "Bob"
    assert again.phase == "question"
    assert again.players[ann.id].answers[0].points == ann.answers[0].points
    assert 5 < again.deadline - later[0] <= 7.5  # the timer went on in real time
    again.answer(again.player_by_token(bob.token), 0, 0, None)  # Bob answers after the restart
    assert again.phase == "reveal"
    assert [t["name"] for t in again.team_board()] == ["Violet", "Teal"]

    # Closing a room removes it from what the next start restores.
    saver = RoomSaver(fresh, store)
    saver.load()
    fresh.close(room.pin)
    saver.flush()
    assert RoomSaver(RoomManager(), store).load() == 0


def test_teams_are_balanced_and_ranked_by_average() -> None:
    room = Room("1", parse_quiz(SOURCE), "boss", lambda: 0.0)
    room.configure(teams=3)
    players = [room.join(n) for n in ["A", "B", "C", "D", "E"]]
    assert [p.team for p in players] == [0, 1, 2, 0, 1]
    room.act("start")
    room.answer(players[2], 0, 1)  # C, alone in team 2, scores
    board = room.team_board()
    assert board[0]["name"] == "Coral"
    assert (board[0]["players"], board[0]["score"]) == (1, players[2].score)
    with pytest.raises(QuizError):
        room.configure(teams=9)


def test_scheduled_self_paced_challenge_opens_and_closes_itself(monkeypatch: pytest.MonkeyPatch) -> None:
    import time as _time

    wall = [1_000_000.0]
    monkeypatch.setattr(_time, "time", lambda: wall[0])
    manager = RoomManager(lambda: 0.0)
    room = manager.create(
        parse_quiz(SOURCE), "boss", mode="self", opens_at=wall[0] + 60, closes_at=wall[0] + 3600
    )
    cy = room.join("Cy")  # joins early, waits in the lobby
    room.tick()
    assert room.phase == "lobby"
    wall[0] += 61
    room.tick()
    assert room.phase == "question"
    room.advance(cy)
    wall[0] += 4000
    room.tick()
    assert room.phase == "finished"
    assert not room.expired(wall[0])  # kept a day after closing for the results
    with pytest.raises(QuizError, match="self-paced"):
        manager.create(parse_quiz(SOURCE), "boss", mode="live", closes_at=wall[0] + 100)
    with pytest.raises(QuizError, match="14 days"):
        manager.create(parse_quiz(SOURCE), "boss", mode="self", closes_at=wall[0] + 20 * 86400)


def test_images_upload_and_serve(admin: TestClient) -> None:
    import base64 as _b64

    png = _b64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    )
    url = "data:image/png;base64," + _b64.b64encode(png).decode()
    up = admin.post("/api/quiz/images", json={"data": url}, headers=API)
    assert up.status_code == 201
    image_id = up.json()["id"]
    assert admin.post("/api/quiz/images", json={"data": url}, headers=API).json()["id"] == image_id
    got = admin.get(f"/api/quiz/images/{image_id}")
    assert (got.status_code, got.headers["content-type"], got.content) == (200, "image/png", png)
    assert "immutable" in got.headers["cache-control"]
    fake = "data:image/png;base64," + _b64.b64encode(b"<svg onload=alert(1)>").decode()
    assert admin.post("/api/quiz/images", json={"data": fake}, headers=API).status_code == 422
    assert admin.get("/api/quiz/images/" + "0" * 24).status_code == 404
    # A quiz item can carry the image; players see its id.
    source = f"Q: Look\nimage: {image_id}\n* a\n- b\n"
    quiz = parse_quiz(source)
    assert quiz.questions[0].image == image_id
    with pytest.raises(QuizFormatError, match="uploaded image"):
        parse_quiz("Q: x\nimage: nope\n* a\n- b\n")


def test_quiz_library_travels_in_the_backup_settings_record() -> None:
    import base64 as _b64
    import json as _json

    from app.backup.format import settings_record
    from app.backup.reader import check_records
    from app.quiz import images, library
    from app.store.memory import MemoryStore

    png = _b64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    )
    source = MemoryStore()
    image_id = images.save_image(source, "data:image/png;base64," + _b64.b64encode(png).decode())
    doc = {"title": "Pics", "items": [{"type": "slide", "text": "Look", "body": "x", "image": image_id}]}
    library.save_quiz(source, "pics1234", doc, None, "a@b")
    studio = library.studio_snapshot(source)
    assert studio is not None
    assert [q["id"] for q in studio["quizzes"]] == ["pics1234"]
    assert list(studio["images"]) == [image_id]

    # The record passes the backup reader's checks (the format stays v1).
    line = settings_record({"tz": "UTC", "notice": None}, studio)
    sha = __import__("hashlib").sha256(line).hexdigest()
    end = _json.dumps(
        {"t": "end", "counts": {"settings": 1, "tombstone": 0, "user": 0, "progress": 0}, "sha256": sha}
    )
    check_records(
        iter([(line.rstrip(b"\n"), True), (end.encode(), True)]), max_part_gz=131072, out=lambda _b: None
    )

    # Restore: a merge keeps an existing quiz, a replace makes the library the backup's.
    target = MemoryStore()
    library.save_quiz(target, "pics1234", {**doc, "title": "Mine"}, None, "me")
    library.save_quiz(target, "other123", {"title": "Other", "items": []}, None, "me")
    assert library.restore_studio(target, studio, "merge") == {"quizzes": 0, "images": 1}
    assert library.get_quiz(target, "pics1234")[0]["title"] == "Mine"
    assert library.restore_studio(target, studio, "replace")["quizzes"] == 1
    assert [q["id"] for q in library.list_quizzes(target)] == ["pics1234"]
    assert library.get_quiz(target, "pics1234")[0]["title"] == "Pics"
    assert images.load_image(target, image_id) == ("image/png", png)
    assert library.studio_snapshot(MemoryStore()) is None


class _FakeAI:
    """Stands in for anthropic.AsyncAnthropic: records the request, returns a canned reply."""

    def __init__(self, reply: Any = None, *, stop: str = "end_turn", error: Exception | None = None) -> None:
        self.calls: list[dict[str, Any]] = []
        self.reply, self.stop, self.error = reply, stop, error
        self.beta = self
        self.messages = self

    async def create(self, **kwargs: Any) -> Any:
        import json as _json
        from types import SimpleNamespace

        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error
        text = SimpleNamespace(type="text", text=_json.dumps(self.reply))
        usage = SimpleNamespace(input_tokens=1200, output_tokens=900)
        return SimpleNamespace(
            content=[text], stop_reason=self.stop, usage=usage, model="claude-opus-5-5", _request_id="req_1"
        )


def test_ai_draft(admin: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.quiz import ai

    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert admin.get("/api/quiz/ai", headers=API).json()["enabled"] is False
    off = admin.post("/api/quiz/ai/draft", json={"notes": "TLS"}, headers=API)
    assert (off.status_code, off.json()["code"]) == (503, "ai_disabled")

    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    good = {
        "type": "single",
        "text": "Which port does HTTPS use?",
        "options": [{"text": "80", "correct": False}, {"text": "443", "correct": True}],
        "answer": False,
        "answers": [],
        "explain": "443 is HTTPS.",
        "hint": "Not 80.",
    }
    broken = {**good, "options": [{"text": "only one", "correct": True}]}  # fails validation
    fake = _FakeAI({"questions": [good, broken]})
    monkeypatch.setattr(ai, "client", lambda: fake)
    r = admin.post(
        "/api/quiz/ai/draft", json={"notes": "HTTPS uses 443.", "count": 2, "advanced": True}, headers=API
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["dropped"] == 1
    assert body["items"][0]["hints"] == ["Not 80."]
    sent = fake.calls[0]
    assert sent["model"] == "claude-opus-5-5"
    assert sent["fallbacks"] == "default"
    assert sent["betas"] == ["server-side-fallback-2026-07-01"]
    assert sent["output_config"]["effort"] == "medium"
    assert sent["output_config"]["format"]["type"] == "json_schema"
    assert "HTTPS uses 443." in sent["messages"][0]["content"]

    monkeypatch.setattr(ai, "client", lambda: _FakeAI({"questions": []}, stop="refusal"))
    declined = admin.post("/api/quiz/ai/draft", json={"notes": "x"}, headers=API)
    assert (declined.status_code, declined.json()["code"]) == (422, "ai_declined")

    import anthropic
    import httpx2

    req = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    err = anthropic.APIConnectionError(request=req)
    monkeypatch.setattr(ai, "client", lambda: _FakeAI(error=err))
    down = admin.post("/api/quiz/ai/draft", json={"notes": "x"}, headers=API)
    assert (down.status_code, down.json()["code"]) == (503, "ai_unavailable")
    assert admin.post("/api/quiz/ai/draft", json={"count": 2}, headers=API).status_code == 422


KAHOOT_STYLE = """title: Fun round
time: 20

Q: How many bits in a byte?
type: slider
min: 0
max: 16
step: 1
answer: 8
margin: 0
unit: bits

Q: Roughly what share of the web uses HTTPS (percent)?
min: 0
max: 100
answer: 95
margin: 5
unit: %

Q: One word for how you feel about TLS
type: cloud

Q: 2 + 2?
- 3
* 4
- 5
- 22
"""


def test_slider_and_word_cloud_items() -> None:
    quiz = parse_quiz(KAHOOT_STYLE)
    assert [q.type for q in quiz.questions] == ["slider", "slider", "cloud", "single"]
    bits, share, cloud, _ = quiz.questions
    assert (bits.low, bits.high, bits.target, bits.margin, bits.unit) == (0, 16, 8, 0, "bits")
    assert (share.scored, cloud.scored, cloud.points) == (True, False, 0)
    from app.quiz.parse import answer_text, quiz_from_json, quiz_to_json

    again = quiz_from_json(quiz_to_json(quiz))
    assert (again.questions[1].target, again.questions[1].margin) == (95, 5)
    assert answer_text(share) == "95 % (±5)"

    now = [0.0]
    room = Room("1", quiz, "boss", lambda: now[0])
    ann, bob, cy = room.join("Ann"), room.join("Bob"), room.join("Cy")
    room.act("start")
    assert room.view(player=ann)["question"]["scale"] == {"min": 0, "max": 16, "step": 1, "unit": "bits"}
    with pytest.raises(QuizError):
        room.answer(ann, 0, 17)  # off the scale
    room.answer(ann, 0, 8)
    room.answer(bob, 0, 7)
    room.answer(cy, 0, 8.0)
    assert (ann.answers[0].correct, bob.answers[0].correct, cy.answers[0].correct) == (True, False, True)
    stats = room.view(host=True)["question"]["stats"]
    assert (stats["median"], sum(stats["bins"])) == (8, 3)
    room.act("next")
    room.answer(ann, 1, 91)  # within the margin of 5
    room.answer(bob, 1, 89)
    room.answer(cy, 1, 100)
    assert [p.answers[1].correct for p in (ann, bob, cy)] == [True, False, True]
    assert room.view(player=ann)["question"]["solution"] == {"value": 95, "margin": 5}

    room.act("next")  # word cloud: no score, grows on screen while answers come in
    room.answer(ann, 2, "Secure!")
    room.answer(bob, 2, "  secure ")
    present = room.present_view()["question"]
    assert present["stats"]["words"] == [["secure", 2]]
    assert "solution" not in present
    with pytest.raises(QuizError):
        room.answer(cy, 2, "   ")
    room.answer(cy, 2, "encrypted")
    assert room.view(player=cy)["question"]["stats"]["words"] == [["secure", 2], ["encrypted", 1]]
    assert (
        cy.score
        == ann.score
        - ann.answers[0].points
        - ann.answers[1].points
        + cy.answers[0].points
        + cy.answers[1].points
    )
    assert all(c["type"] != "cloud" for c in room.cards())


def test_streak_bonus_auto_play_and_shuffled_answers() -> None:
    now = [0.0]
    room = Room("1", parse_quiz(SOURCE), "boss", lambda: now[0])
    room.configure(streak_bonus=True, autoplay=5, shuffle=True)
    q0 = room.quiz.questions[0]
    assert q0.options[q0.correct[0]] == "4"  # options moved, the right answer followed
    ann, bob = room.join("Ann"), room.join("Bob")
    room.act("start")
    right0 = q0.correct[0]
    room.answer(ann, 0, right0)
    room.answer(bob, 0, 1 - right0 if right0 < 2 else 0)
    assert ann.answers[0].bonus == 0  # the first right answer starts a streak: no bonus yet
    assert room.phase == "reveal"
    now[0] += 4.9
    room.tick()
    assert room.phase == "reveal"
    assert room.view(host=True)["autoMs"] == 100
    now[0] += 0.2
    room.tick()  # auto-play: the next question opens by itself
    assert (room.phase, room.index) == ("question", 1)
    q1 = room.quiz.questions[1]
    room.answer(ann, 1, list(q1.correct))
    room.answer(bob, 1, [0])
    assert (ann.streak, ann.answers[1].bonus) == (2, 100)
    assert room.view(player=ann)["me"]["lastBonus"] == 100
    now[0] += 5.1
    room.tick()
    assert room.index == 2
    now[0] += 10.1  # time runs out with no answers, then the results show for 5 s
    room.tick()
    assert (room.phase, ann.streak) == ("reveal", 0)
    with pytest.raises(QuizError):
        room.configure(autoplay=7)
    with pytest.raises(QuizError):  # self-paced rooms have no host pace to automate
        Room("2", parse_quiz(SOURCE), "boss", lambda: 0.0, mode="self").configure(autoplay=5)


def test_friendly_names_reactions_report_and_needs_help() -> None:
    from app.quiz.names import is_friendly

    room = Room("1", parse_quiz(SOURCE), "boss", lambda: 0.0)
    room.configure(friendly_names=True)
    suggestions = room.suggest_names()
    assert len(suggestions) == 3
    assert all(is_friendly(n) for n in suggestions)
    with pytest.raises(QuizError) as typed:
        room.join("Whatever I like")
    assert typed.value.code == "friendly_only"
    ann = room.join(suggestions[0])
    bob = room.join(suggestions[1])
    assert suggestions[0].casefold() not in {n.casefold() for n in room.suggest_names()}

    room.react(ann, 0)
    with pytest.raises(QuizError) as fast:
        room.react(ann, 1)  # one at a time
    assert fast.value.code == "slow_down"
    room.react(bob, 5)
    assert [r[1] for r in room.present_view()["reactions"]] == ["👍", "🔥"]
    with pytest.raises(QuizError):
        room.react(bob, 9)

    room.act("start")
    room.answer(ann, 0, 1)
    room.answer(bob, 0, 0)
    room.act("next")
    room.answer(ann, 1, [0, 1])
    room.answer(bob, 1, [2])
    room.act("end")
    host = room.view(host=True)
    assert [r["name"] for r in host["needsHelp"]] == [bob.name]
    report = room.report()
    assert report["columns"][:4] == ["Player", "Team", "Rank", "Item"]
    first = report["rows"][0]
    assert (first[0], first[3], first[6], first[7]) == (ann.name, 1, "4", "right")
    assert any(
        row[0] == bob.name and row[3] == 2 and row[6] == "4" and row[7] == "wrong" for row in report["rows"]
    )
    assert any(row[3] == 3 and row[7] == "no answer" for row in report["rows"])

    quiet = Room("2", parse_quiz(SOURCE), "boss", lambda: 0.0)
    quiet.configure(reactions=False)
    with pytest.raises(QuizError):
        quiet.react(quiet.join("Cy"), 0)


def test_new_room_options_through_the_api(admin: TestClient) -> None:
    created = admin.post(
        "/api/quiz/rooms",
        json={"source": SOURCE, "friendlyNames": True, "streakBonus": True, "autoplay": 8, "reactions": True},
        headers=API,
    ).json()
    pin, key = created["pin"], created["hostKey"]
    admin.cookies.clear()
    info = admin.get(f"/api/quiz/rooms/{pin}/info").json()
    assert (info["friendlyNames"], info["phase"]) == (True, "lobby")
    names = admin.get(f"/api/quiz/rooms/{pin}/names").json()["names"]
    refused = admin.post(f"/api/quiz/rooms/{pin}/join", json={"name": "Typed Name"}, headers=API)
    assert refused.status_code == 422
    joined = admin.post(f"/api/quiz/rooms/{pin}/join", json={"name": names[0]}, headers=API).json()
    me = {**API, "X-Quiz-Token": joined["token"]}
    assert admin.post(f"/api/quiz/rooms/{pin}/react", json={"emoji": 1}, headers=me).status_code == 200
    assert admin.post(f"/api/quiz/rooms/{pin}/react", json={"emoji": 1}, headers=me).status_code == 429
    view = admin.get(f"/api/quiz/rooms/{pin}", headers=me).json()
    assert view["options"] == {
        "streakBonus": True,
        "autoplay": 8,
        "shuffle": False,
        "friendlyNames": True,
        "reactions": True,
    }
    host = {**API, "X-Quiz-Host": key}
    report = admin.get(f"/api/quiz/rooms/{pin}/host/report", headers=host).json()
    assert report["rows"][0][0] == names[0]
    assert admin.get(f"/api/quiz/rooms/{pin}/host/report", headers=me).status_code == 403


def test_new_options_survive_a_restart() -> None:
    from app.quiz.persist import RoomSaver
    from app.store.memory import MemoryStore

    now = [10.0]
    manager = RoomManager(lambda: now[0])
    room = manager.create(parse_quiz(KAHOOT_STYLE), "boss", streak_bonus=True, autoplay=12, shuffle=True)
    ann = room.join("Ann")
    room.act("start")
    room.answer(ann, 0, 8)  # everyone answered: reveal, auto-play counts down
    store = MemoryStore()
    RoomSaver(manager, store).flush(force=True)
    fresh = RoomManager(lambda: 900.0)
    RoomSaver(fresh, store).load()
    again = fresh.get(room.pin)
    assert again.options_state() == room.options_state()
    assert [q.options for q in again.quiz.questions] == [q.options for q in room.quiz.questions]
    assert 11 < again.auto_at() - 900.0 <= 12.001  # saved times are rounded to 1 ms (persist._to_wall)
