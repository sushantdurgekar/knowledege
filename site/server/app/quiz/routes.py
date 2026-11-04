"""Live quiz API.

Admin (signed-in admin, CSRF on writes):
  GET  /api/quiz/template            the text import format, as a file to start from
  POST /api/quiz/parse               {source} or {quiz} -> {ok, title, questions, quiz} | {ok:false, errors}
  POST /api/quiz/rooms               {source|quiz, mode: live|self, study} -> {pin, hostKey}
  GET  /api/quiz/rooms               the admin's open rooms
  GET  /api/quiz/library             saved quizzes (shared by admins)
  GET|PUT|DELETE /api/quiz/library/{id}   one saved quiz ({doc, version}; PUT {doc, expect})
  GET  /api/quiz/bank                hubs and modules with practice questions
  GET  /api/quiz/bank/{hubId}        one hub's modules: key points and questions
  POST /api/quiz/images              {data: data-URL} -> {id} (shrunk in the browser first)
  GET  /api/quiz/images/{id}         the image (public, immutable)

Host (X-Quiz-Host: the room's hostKey; no admin re-check per poll):
  GET  /api/quiz/rooms/{pin}/host?since=N      long-poll, full view with solutions and run sheet
  POST /api/quiz/rooms/{pin}/host/action       {action: start|reveal|next|goto|extend|lock|unlock|
                                                end|close|kick, index?, seconds?, playerId?}
  GET  /api/quiz/rooms/{pin}/host/cards        every question + answer + results (vault export)

Players (no account needed; X-Quiz-Token from join):
  POST /api/quiz/rooms/{pin}/join              {name} -> {playerId, token}
  GET  /api/quiz/rooms/{pin}?since=N           long-poll, the player's view
  POST /api/quiz/rooms/{pin}/answer            {index, answer}
  POST /api/quiz/rooms/{pin}/advance           self-paced: open my next item
  POST /api/quiz/rooms/{pin}/hint              {index} -> {hints} (advanced; each hint costs points)
  GET  /api/quiz/rooms/{pin}/review            every question with its solution and my result
  GET  /api/quiz/rooms/{pin}/cards             flashcards (study rooms, or once finished)

Presenter (X-Quiz-Present: the room's presentKey, handed out by the host) and anyone:
  GET  /api/quiz/rooms/{pin}/present?since=N   long-poll, the projected screen (no early answers)
  GET  /api/quiz/rooms/{pin}/board?since=N     long-poll, public leaderboard (no key)

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
from starlette.concurrency import run_in_threadpool

from app.admin.auth import require_admin
from app.auth import ratelimit
from app.auth.csrf import csrf_protect
from app.auth.deps import Viewer
from app.errors import ApiError
from app.quiz import ai, images, library
from app.quiz.bank import bank_hub, bank_index, load_bank
from app.quiz.library import LibraryError
from app.quiz.parse import (
    ADVANCED_TEMPLATE,
    TEMPLATE,
    Quiz,
    QuizFormatError,
    parse_quiz,
    quiz_from_json,
    quiz_to_json,
)
from app.quiz.persist import RoomSaver
from app.quiz.room import QuizError, Room, RoomManager
from app.runtime import get_runtime
from app.store.base import Store, StoreError

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


def _epoch(value: Any) -> float | None:
    """A time from the client: epoch milliseconds, or None."""
    if value in (None, ""):
        return None
    if not isinstance(value, int | float) or isinstance(value, bool) or value <= 0:
        raise ApiError(422, "invalid", "Times must be epoch milliseconds")
    return float(value) / 1000


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
async def template(request: Request, admin: Admin) -> Response:
    advanced = request.query_params.get("advanced") == "1"
    return Response(
        ADVANCED_TEMPLATE if advanced else TEMPLATE,
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
    teams = data.get("teams") or 0
    if not isinstance(teams, int) or isinstance(teams, bool):
        raise ApiError(422, "invalid", "teams must be a number")
    try:
        room = _manager.create(
            quiz,
            admin.uid,
            mode=mode,
            study=bool(data.get("study")),
            teams=teams,
            opens_at=_epoch(data.get("opensAt")),
            closes_at=_epoch(data.get("closesAt")),
        )
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


@router.get("/rooms/{pin}/host/cards")
async def host_cards(request: Request, pin: str) -> JSONResponse:
    """Every question with its answer and the room's results: the host's vault export."""
    room = _host_room(request, pin)
    return _json({"title": room.quiz.title, "cards": room.cards(), "insights": room.insights()})


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
        room.answer(player, index, data.get("answer"), data.get("confidence"))
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


@router.post("/rooms/{pin}/hint", dependencies=CSRF)
async def hint(request: Request, pin: str) -> JSONResponse:
    room = _room(pin)
    index = (await _body(request)).get("index")
    if not isinstance(index, int) or isinstance(index, bool):
        raise ApiError(422, "invalid", "index must be a number")
    try:
        player = room.player_by_token(request.headers.get("x-quiz-token"))
        hints = room.hint(player, index)
    except QuizError as exc:
        raise _err(exc) from None
    return _json({"hints": hints})


@router.get("/rooms/{pin}/review")
async def review(request: Request, pin: str) -> JSONResponse:
    room = _room(pin)
    try:
        player = room.player_by_token(request.headers.get("x-quiz-token"))
    except QuizError as exc:
        raise _err(exc) from None
    if not (room.phase == "finished" or player.stage == "done"):
        raise ApiError(403, "review_closed", "Review opens once you have finished")
    return _json({"title": room.quiz.title, "items": room.review(player), "advanced": room.quiz.advanced})


# -- saved quizzes (library) and the hubs' question bank ------------------------------------
async def _library(call: Any, *args: Any) -> Any:
    try:
        return await run_in_threadpool(call, *args)
    except LibraryError as exc:
        raise ApiError(exc.status, exc.code, exc.message) from None
    except StoreError as exc:
        raise ApiError(503, "unavailable", "Saved quizzes are unavailable right now", retry_after=30) from exc


@router.get("/library")
async def library_list(request: Request, admin: Admin) -> JSONResponse:
    return _json({"quizzes": await _library(library.list_quizzes, get_runtime(request).store)})


@router.get("/library/{quiz_id}")
async def library_get(request: Request, quiz_id: str, admin: Admin) -> JSONResponse:
    doc, version = await _library(library.get_quiz, get_runtime(request).store, quiz_id)
    return _json({"doc": doc, "version": version})


@router.put("/library/{quiz_id}", dependencies=CSRF)
async def library_put(request: Request, quiz_id: str, admin: Admin) -> JSONResponse:
    data = await _body(request)
    expect = data.get("expect")
    expect = expect if isinstance(expect, int) and not isinstance(expect, bool) else None
    by = (admin.identity.email if admin.identity else "") or ""
    version = await _library(
        library.save_quiz, get_runtime(request).store, quiz_id, data.get("doc"), expect, by
    )
    return _json({"version": version})


@router.delete("/library/{quiz_id}", dependencies=CSRF)
async def library_delete(request: Request, quiz_id: str, admin: Admin) -> JSONResponse:
    await _library(library.delete_quiz, get_runtime(request).store, quiz_id)
    return _json({"deleted": True})


@router.get("/bank")
async def bank_list(request: Request, admin: Admin) -> JSONResponse:
    return _json({"hubs": bank_index(load_bank(get_runtime(request).settings.hubs_dir))})


@router.get("/bank/{hub_id}")
async def bank_get(request: Request, hub_id: str, admin: Admin) -> JSONResponse:
    hub = bank_hub(load_bank(get_runtime(request).settings.hubs_dir), hub_id)
    if hub is None:
        raise ApiError(404, "not_found", "No such hub in the question bank")
    return _json(hub)


@router.get("/rooms/{pin}/present")
async def present(request: Request, pin: str) -> JSONResponse:
    room = _room(pin)
    key = request.headers.get("x-quiz-present", "")
    if not key or not secrets.compare_digest(key, room.present_key):
        raise ApiError(403, "not_presenter", "This presenter link is not valid; ask the host for a new one")
    since = _since(request)
    await room.wait(since, POLL_S, host=True)
    if room.version > since and room.phase == "question":
        await asyncio.sleep(HOST_DEBOUNCE_S)  # batch a burst of answers into one update
    if _manager.rooms.get(room.pin) is not room:
        raise ApiError(404, "no_room", "This room was closed")
    return _json(room.present_view())


@router.get("/rooms/{pin}/board")
async def board(request: Request, pin: str) -> JSONResponse:
    room = _room(pin)
    await room.wait(_since(request), POLL_S)
    if _manager.rooms.get(room.pin) is not room:
        raise ApiError(404, "no_room", "This quiz has closed")
    return _json(room.board_view())


# -- images -----------------------------------------------------------------------------------
IMAGE_CACHE = "public, max-age=31536000, immutable"


@router.post("/images", dependencies=CSRF)
async def image_upload(request: Request, admin: Admin) -> JSONResponse:
    data = await _body(request)
    try:
        image_id = await run_in_threadpool(images.save_image, get_runtime(request).store, data.get("data"))
    except images.ImageError as exc:
        raise ApiError(exc.status, "invalid", exc.message) from None
    except StoreError as exc:
        raise ApiError(503, "unavailable", "Images are unavailable right now", retry_after=30) from exc
    return _json({"id": image_id}, 201)


@router.get("/images/{image_id}")
async def image_get(request: Request, image_id: str) -> Response:
    try:
        found = await run_in_threadpool(images.load_image, get_runtime(request).store, image_id)
    except StoreError as exc:
        raise ApiError(503, "unavailable", "Images are unavailable right now", retry_after=30) from exc
    if found is None:
        raise ApiError(404, "not_found", "No such image")
    mime, raw = found
    return Response(
        raw, media_type=mime, headers={"Cache-Control": IMAGE_CACHE, "X-Content-Type-Options": "nosniff"}
    )


# -- saving rooms across restarts ---------------------------------------------------------------
_saver: RoomSaver | None = None


async def start_saver(store: Store) -> None:
    """Restore saved rooms, then keep saving changed ones (app lifespan)."""
    global _saver
    _saver = RoomSaver(_manager, store)
    await _saver.start()


async def stop_saver() -> None:
    if _saver is not None:
        await _saver.stop()


# -- AI-drafted questions (optional) ------------------------------------------------------------
AI_RULE = ratelimit.Rule.per_minute("quiz-ai", 3, burst=6)


@router.get("/ai")
async def ai_status(admin: Admin) -> JSONResponse:
    return _json({"enabled": ai.enabled(), "model": ai.MODEL})


@router.post("/ai/draft", dependencies=CSRF)
async def ai_draft(request: Request, admin: Admin) -> JSONResponse:
    """{hubId, moduleIds} or {notes}, count (1-15), kinds, advanced -> draft items to review."""
    runtime = get_runtime(request)
    wait = runtime.limiter.hit("quiz-ai:" + admin.uid, AI_RULE)
    if wait is not None:
        raise ApiError(
            429, "rate_limited", "Too many AI drafts in a row; try again shortly", retry_after=wait
        )
    data = await _body(request)
    count = data.get("count", 8)
    if not isinstance(count, int) or isinstance(count, bool) or not 1 <= count <= 15:
        raise ApiError(422, "invalid", "count must be 1-15")
    kinds = [k for k in data.get("kinds") or [] if k in ai.KINDS] or ["single", "multi", "truefalse"]
    avoid = [str(q)[:300] for q in data.get("avoid") or [] if isinstance(q, str)][:60]
    notes = data.get("notes")
    if isinstance(notes, str) and notes.strip():
        source = notes.strip()[: ai.MAX_SOURCE_CHARS]
    else:
        hub = bank_hub(load_bank(runtime.settings.hubs_dir), str(data.get("hubId", "")))
        module_ids = [m for m in data.get("moduleIds") or [] if isinstance(m, str)]
        if hub is None or not module_ids:
            raise ApiError(422, "invalid", "Pick a hub and modules, or paste notes")
        source, bank_avoid = ai.source_from_bank(hub, module_ids)
        avoid = avoid + bank_avoid
        if not source.strip():
            raise ApiError(422, "invalid", "Those modules have no key points to draft from")
    try:
        result = await ai.draft(
            source, count=count, kinds=kinds, advanced=bool(data.get("advanced")), avoid=avoid
        )
    except ai.AiError as exc:
        raise ApiError(exc.status, exc.code, exc.message) from None
    return _json(result)
