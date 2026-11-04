"""Live quiz API.

Admin (signed-in admin, CSRF on writes):
  GET  /api/quiz/template            the text import format, as a file to start from
  POST /api/quiz/parse               {source} or {quiz} -> {ok, title, questions, quiz} | {ok:false, errors}
  POST /api/quiz/rooms               {source|quiz, mode: live|self, study} -> {pin, hostKey}
  GET  /api/quiz/rooms               the admin's open rooms

Host (X-Quiz-Host: the room's hostKey; no admin re-check per poll):
  GET  /api/quiz/rooms/{pin}/host?since=N      long-poll, full view with solutions and run sheet
  POST /api/quiz/rooms/{pin}/host/action       {action: start|reveal|next|goto|extend|lock|unlock|
                                                end|close|kick, index?, seconds?, playerId?}

Players (no account needed; X-Quiz-Token from join):
  POST /api/quiz/rooms/{pin}/join              {name} -> {playerId, token}
  GET  /api/quiz/rooms/{pin}?since=N           long-poll, the player's view
  POST /api/quiz/rooms/{pin}/answer            {index, answer}
  POST /api/quiz/rooms/{pin}/advance           self-paced: open my next item
  GET  /api/quiz/rooms/{pin}/cards             flashcards (study rooms, or once finished)

Long-polls answer at once when the room's version is above `since`, otherwise within 20 s
(or when the open question's time runs out).
"""

from __future__ import annotations

import asyncio
import json
import secrets
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, Response

from app.admin.auth import require_admin
from app.auth import ratelimit
from app.auth.csrf import csrf_protect
from app.auth.deps import Viewer
from app.errors import ApiError
from app.quiz.parse import TEMPLATE, Quiz, QuizFormatError, parse_quiz, quiz_from_json, quiz_to_json
from app.quiz.room import QuizError, Room, RoomManager
from app.runtime import get_runtime

router = APIRouter(prefix="/api/quiz")
Admin = Annotated[Viewer, Depends(require_admin)]
CSRF = [Depends(csrf_protect)]

POLL_S = 20.0
MAX_BODY = 256 * 1024
# Per client IP. A whole classroom often shares one public IP (school NAT), so these allow a
# full room (MAX_PLAYERS) through one address; answers are limited per player by the room
# itself (one per question), so they need no IP limit.
JOIN_RULE = ratelimit.Rule.per_minute("quiz-join", 400, burst=300)
HOST_DEBOUNCE_S = 0.25
NO_STORE = {"Cache-Control": "no-store"}

_manager = RoomManager()


def get_manager() -> RoomManager:
    return _manager


def _json(data: Any, status: int = 200) -> JSONResponse:
    return JSONResponse(data, status_code=status, headers=NO_STORE)


def _err(exc: QuizError) -> ApiError:
    return ApiError(exc.status, exc.code, exc.message)


async def _body(request: Request) -> dict[str, Any]:
    raw = await request.body()
    if len(raw) > MAX_BODY:
        raise ApiError(413, "too_large", "The request is too large")
    try:
        data = json.loads(raw or b"{}")
    except ValueError:
        raise ApiError(400, "bad_request", "The body must be JSON") from None
    if not isinstance(data, dict):
        raise ApiError(400, "bad_request", "The body must be a JSON object")
    return data


def _room(pin: str) -> Room:
    try:
        return _manager.get(pin)
    except QuizError as exc:
        raise _err(exc) from None


def _since(request: Request) -> int:
    try:
        return int(request.query_params.get("since", "0"))
    except ValueError:
        return 0


def _limit(request: Request, key: str, rule: ratelimit.Rule) -> None:
    runtime = get_runtime(request)
    ip = ratelimit.client_ip(request, runtime.settings.trusted_proxy_hops or 0)
    wait = runtime.limiter.hit(f"{key}:{ip}", rule)
    if wait is not None:
        raise ApiError(429, "rate_limited", "Too many requests, try again shortly", retry_after=wait)


def _load(data: dict[str, Any]) -> Quiz:
    """The quiz in a request: the builder's JSON (`quiz`) or the text format (`source`)."""
    if isinstance(data.get("quiz"), dict):
        return quiz_from_json(data["quiz"])
    source = data.get("source")
    if not isinstance(source, str) or not source.strip():
        raise ApiError(422, "invalid", "Add some questions first")
    return parse_quiz(source)


def _summary(quiz: Quiz) -> dict[str, Any]:
    return {
        "title": quiz.title,
        "questions": [
            {"text": q.text[:160], "type": q.type, "timeLimit": q.time_limit, "points": q.points}
            for q in quiz.questions
        ],
    }


# -- admin ---------------------------------------------------------------------------------
@router.get("/template")
async def template(admin: Admin) -> Response:
    return Response(
        TEMPLATE,
        media_type="text/plain; charset=utf-8",
        headers={**NO_STORE, "Content-Disposition": 'attachment; filename="quiz-template.txt"'},
    )


@router.post("/parse", dependencies=CSRF)
async def parse(request: Request, admin: Admin) -> JSONResponse:
    try:
        quiz = _load(await _body(request))
    except QuizFormatError as exc:
        return _json({"ok": False, "errors": exc.errors})
    return _json({"ok": True, **_summary(quiz), "quiz": quiz_to_json(quiz)})


@router.post("/rooms", dependencies=CSRF)
async def create_room(request: Request, admin: Admin) -> JSONResponse:
    data = await _body(request)
    try:
        quiz = _load(data)
    except QuizFormatError as exc:
        raise ApiError(422, "quiz_format", "; ".join(exc.errors[:5])) from None
    mode = data.get("mode", "live")
    if mode not in ("live", "self"):
        raise ApiError(422, "invalid", "mode must be live or self")
    try:
        room = _manager.create(quiz, admin.uid, mode=mode, study=bool(data.get("study")))
    except QuizError as exc:
        raise _err(exc) from None
    return _json({"pin": room.pin, "hostKey": room.host_key, "mode": room.mode, **_summary(quiz)}, 201)


@router.get("/rooms")
async def my_rooms(admin: Admin) -> JSONResponse:
    rooms = [
        {
            "pin": r.pin,
            "title": r.quiz.title,
            "phase": r.phase,
            "mode": r.mode,
            "players": len(r.players),
            "hostKey": r.host_key,
            "created": r.created,
        }
        for r in _manager.owned_by(admin.uid)
    ]
    return _json({"rooms": rooms})


# -- host ----------------------------------------------------------------------------------
def _host_room(request: Request, pin: str) -> Room:
    room = _room(pin)
    key = request.headers.get("x-quiz-host", "")
    if not key or not secrets.compare_digest(key, room.host_key):
        raise ApiError(403, "not_host", "This browser is not the host of that room")
    return room


@router.get("/rooms/{pin}/host")
async def host_view(request: Request, pin: str) -> JSONResponse:
    room = _host_room(request, pin)
    since = _since(request)
    await room.wait(since, POLL_S, host=True)
    if room.version > since and room.phase == "question":
        await asyncio.sleep(HOST_DEBOUNCE_S)  # batch a burst of answers into one host update
    if _manager.rooms.get(room.pin) is not room:
        raise ApiError(404, "no_room", "This room was closed")
    return _json(room.view(host=True))


@router.post("/rooms/{pin}/host/action", dependencies=CSRF)
async def host_action(request: Request, pin: str) -> JSONResponse:
    room = _host_room(request, pin)
    data = await _body(request)
    action = data.get("action")
    try:
        if action == "close":
            _manager.close(room.pin)
            return _json({"closed": True})
        index, seconds = data.get("index"), data.get("seconds")
        if action == "kick":
            room.kick(str(data.get("playerId", "")))
        elif action in ("start", "reveal", "next", "goto", "extend", "lock", "unlock", "end"):
            room.act(
                action,
                index=index if isinstance(index, int) and not isinstance(index, bool) else None,
                seconds=seconds if isinstance(seconds, int) and not isinstance(seconds, bool) else None,
            )
        else:
            raise ApiError(422, "invalid", "Unknown action")
    except QuizError as exc:
        raise _err(exc) from None
    return _json(room.view(host=True))


# -- players -------------------------------------------------------------------------------
@router.post("/rooms/{pin}/join", dependencies=CSRF)
async def join(request: Request, pin: str) -> JSONResponse:
    _limit(request, "quiz-join", JOIN_RULE)
    room = _room(pin)
    name = (await _body(request)).get("name")
    try:
        player = room.join(name if isinstance(name, str) else "")
    except QuizError as exc:
        raise _err(exc) from None
    return _json({"playerId": player.id, "token": player.token, "name": player.name}, 201)


@router.get("/rooms/{pin}")
async def player_view(request: Request, pin: str) -> JSONResponse:
    room = _room(pin)
    try:
        player = room.player_by_token(request.headers.get("x-quiz-token"))
    except QuizError as exc:
        raise _err(exc) from None
    until = player.deadline if room.mode == "self" and player.stage == "question" else None
    await room.wait(_since(request), POLL_S, until=until)
    if _manager.rooms.get(room.pin) is not room:
        raise ApiError(404, "no_room", "The host closed this room")
    if player.id not in room.players:
        raise ApiError(403, "removed", "The host removed you from this room")
    return _json(room.view(player=player))


@router.post("/rooms/{pin}/answer", dependencies=CSRF)
async def answer(request: Request, pin: str) -> JSONResponse:
    room = _room(pin)
    data = await _body(request)
    index = data.get("index")
    if not isinstance(index, int) or isinstance(index, bool):
        raise ApiError(422, "invalid", "index must be a number")
    try:
        player = room.player_by_token(request.headers.get("x-quiz-token"))
        room.answer(player, index, data.get("answer"))
    except QuizError as exc:
        raise _err(exc) from None
    return _json(room.view(player=player))


@router.post("/rooms/{pin}/advance", dependencies=CSRF)
async def advance(request: Request, pin: str) -> JSONResponse:
    room = _room(pin)
    try:
        player = room.player_by_token(request.headers.get("x-quiz-token"))
        room.advance(player)
    except QuizError as exc:
        raise _err(exc) from None
    return _json(room.view(player=player))


@router.get("/rooms/{pin}/cards")
async def cards(request: Request, pin: str) -> JSONResponse:
    room = _room(pin)
    try:
        player = room.player_by_token(request.headers.get("x-quiz-token"))
    except QuizError as exc:
        raise _err(exc) from None
    if not room.cards_open_to(player):
        raise ApiError(403, "cards_closed", "Flashcards open once the quiz is over")
    return _json({"title": room.quiz.title, "cards": room.cards()})
