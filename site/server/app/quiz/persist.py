"""Running rooms survive a restart or a deploy.

Render's free plan has no persistent disk, so rooms are saved in the store (the same settings
documents every backend supports): `quiz-rooms` lists the open pins and `quiz-room:<pin>` holds
one room, gzip-compressed (a full 250-player room is a few tens of KB).

Writes are kept low (the Firestore budget is ~19k writes a day): a room is saved when its
phase or current item changes, or at most every SAVE_EVERY_S while answers come in, and once
more on shutdown (Render sends SIGTERM before every deploy). About 5 writes per question.

Clocks: the room runs on time.monotonic(), which restarts with the process, so saved times
are converted to wall-clock epoch seconds and back. An open question's timer keeps running
in real time across the restart.
"""

from __future__ import annotations

import asyncio
import base64
import contextlib
import gzip
import json
import logging
import math
import time
from typing import Any

from starlette.concurrency import run_in_threadpool

from app.quiz.parse import quiz_from_json, quiz_to_json
from app.quiz.room import Answer, Player, Room, RoomManager
from app.store.base import Conflict, Store, StoreError

logger = logging.getLogger(__name__)

INDEX_KEY = "quiz-rooms"
SAVE_EVERY_S = 10.0
TICK_S = 2.0
MAX_STATE_BYTES = 900_000  # stays under Firestore's 1 MiB document limit


def room_key(pin: str) -> str:
    return f"quiz-room:{pin}"


# -- (de)serialising ----------------------------------------------------------------------------
def _to_wall(mono: float, now_mono: float, now_wall: float) -> float | None:
    return None if not math.isfinite(mono) else round(mono - now_mono + now_wall, 3)


def _to_mono(wall: float | None, now_mono: float, now_wall: float) -> float:
    return math.inf if wall is None else wall - now_wall + now_mono


def room_state(room: Room) -> dict[str, Any]:
    now_m, now_w = room.clock(), time.time()
    w = lambda m: _to_wall(m, now_m, now_w)  # noqa: E731
    return {
        "v": 1,
        "pin": room.pin,
        "quiz": quiz_to_json(room.quiz),
        "owner": room.owner,
        "mode": room.mode,
        "study": room.study,
        "hostKey": room.host_key,
        "presentKey": room.present_key,
        "phase": room.phase,
        "locked": room.locked,
        "index": room.index,
        "done": sorted(room.done),
        "openedAt": w(room.opened_at),
        "deadline": w(room.deadline),
        "revealedAt": w(room.revealed_at),
        "touched": w(room.touched),
        "created": room.created,
        "answeredCount": room.answered_count,
        "orders": {str(k): v for k, v in room.orders.items()},
        "extra": room.extra_state(),
        "players": [
            {
                "id": p.id,
                "name": p.name,
                "token": p.token,
                "score": p.score,
                "timeTotal": p.time_total,
                "correct": p.correct,
                "streak": p.streak,
                "joined": w(p.joined),
                "index": p.index,
                "stage": p.stage,
                "openedAt": w(p.opened_at),
                "deadline": w(p.deadline),
                "team": p.team,
                "hints": {str(k): v for k, v in p.hints_used.items()},
                "answers": {
                    str(k): [
                        a.value,
                        a.elapsed,
                        a.fraction,
                        a.points,
                        a.scored,
                        a.confidence,
                        a.hints,
                        a.bonus,
                    ]
                    for k, a in p.answers.items()
                },
            }
            for p in room.players.values()
        ],
    }


def restore_room(state: dict[str, Any], clock: Any) -> Room:
    now_m, now_w = clock(), time.time()
    m = lambda wall: _to_mono(wall, now_m, now_w)  # noqa: E731
    room = Room(
        state["pin"],
        quiz_from_json(state["quiz"]),
        state["owner"],
        clock,
        mode=state["mode"],
        study=bool(state["study"]),
    )
    room.host_key = state["hostKey"]
    room.present_key = state["presentKey"]
    room.phase = state["phase"]
    room.locked = bool(state["locked"])
    room.index = int(state["index"])
    room.done = set(state["done"])
    room.opened_at = m(state["openedAt"])
    room.deadline = m(state["deadline"])
    room.revealed_at = m(state.get("revealedAt"))
    room.touched = now_m  # a restored room counts as active again
    room.created = float(state["created"])
    room.answered_count = int(state["answeredCount"])
    room.orders = {int(k): list(v) for k, v in state["orders"].items()}
    room.load_extra_state(state.get("extra") or {})
    for raw in state["players"]:
        player = Player(
            id=raw["id"],
            name=raw["name"],
            token=raw["token"],
            score=raw["score"],
            time_total=raw["timeTotal"],
            correct=raw["correct"],
            streak=raw["streak"],
            joined=m(raw["joined"]),
            index=raw["index"],
            stage=raw["stage"],
            opened_at=m(raw["openedAt"]),
            deadline=m(raw["deadline"]),
            team=raw.get("team"),
        )
        player.hints_used = {int(k): v for k, v in raw["hints"].items()}
        player.answers = {int(k): Answer(*a) for k, a in raw["answers"].items()}
        room.adopt(player)
    room.version += 1  # clients re-poll and pick the restored state up
    room.pversion += 1
    return room


def pack(state: dict[str, Any]) -> dict[str, Any]:
    raw = json.dumps(state, separators=(",", ":"), ensure_ascii=False).encode()
    return {"gz": base64.b64encode(gzip.compress(raw, 6)).decode()}


def unpack(value: dict[str, Any]) -> dict[str, Any] | None:
    blob = value.get("gz") if isinstance(value, dict) else None
    if not isinstance(blob, str):
        return None
    return json.loads(gzip.decompress(base64.b64decode(blob)))


# -- the saver ----------------------------------------------------------------------------------
class RoomSaver:
    """Writes changed rooms to the store and reloads them at startup."""

    def __init__(self, manager: RoomManager, store: Store) -> None:
        self.manager = manager
        self.store = store
        self._saved: dict[str, tuple[int, str, int, float]] = {}  # pin -> version, phase, index, at
        self._task: asyncio.Task[None] | None = None
        self._pins: set[str] = set()

    # sync parts (run in a thread)
    def _write_index(self, pins: set[str]) -> None:
        for _ in range(3):
            found = self.store.get_setting(INDEX_KEY)
            try:
                self.store.put_setting(
                    INDEX_KEY, {"pins": sorted(pins)}, expect_version=found[1] if found else 0
                )
                self._pins = set(pins)
                return
            except Conflict:
                continue

    def _save(self, room: Room) -> None:
        packed = pack(room_state(room))
        if len(packed["gz"]) > MAX_STATE_BYTES:
            logger.warning("Room %s is too large to save (%d bytes)", room.pin, len(packed["gz"]))
            return
        self.store.put_setting(room_key(room.pin), packed, expect_version=None)

    def _drop(self, pin: str) -> None:
        self.store.put_setting(room_key(pin), {"closed": True}, expect_version=None)

    def load(self) -> int:
        """Restore every saved room (startup). Returns how many came back."""
        found = self.store.get_setting(INDEX_KEY)
        pins = list(found[0].get("pins", [])) if found else []
        restored = 0
        for pin in pins:
            try:
                got = self.store.get_setting(room_key(pin))
                state = unpack(got[0]) if got else None
                if state is None:
                    continue
                room = restore_room(state, self.manager.clock)
                self.manager.rooms[room.pin] = room
                self._saved[pin] = (room.version, room.phase, room.index, time.monotonic())
                restored += 1
            except Exception:  # one bad room must not stop the others
                logger.exception("Could not restore quiz room %s", pin)
        self._pins = set(self.manager.rooms)
        return restored

    def flush(self, *, force: bool = False) -> None:
        """Save rooms that changed (all of them when force), drop closed ones."""
        now = time.monotonic()
        live = dict(self.manager.rooms)
        for pin, room in live.items():
            last = self._saved.get(pin)
            if last is not None and last[0] == room.version:
                continue
            moved = last is None or last[1] != room.phase or last[2] != room.index
            if force or moved or now - last[3] >= SAVE_EVERY_S:
                try:
                    self._save(room)
                    self._saved[pin] = (room.version, room.phase, room.index, now)
                except StoreError as exc:
                    logger.warning("Saving quiz room %s failed: %s", pin, exc)
        for pin in [p for p in self._saved if p not in live]:
            with contextlib.suppress(StoreError):
                self._drop(pin)
            self._saved.pop(pin, None)
        if set(live) != self._pins:
            with contextlib.suppress(StoreError):
                self._write_index(set(live))

    # async loop
    async def run_forever(self) -> None:
        while True:
            await asyncio.sleep(TICK_S)
            try:
                await run_in_threadpool(self.flush)
            except Exception:
                logger.exception("Quiz room saver failed")

    async def start(self) -> None:
        try:
            restored = await run_in_threadpool(self.load)
            if restored:
                logger.info("Restored %d quiz room(s)", restored)
        except Exception:
            logger.exception("Restoring quiz rooms failed")
        self._task = asyncio.create_task(self.run_forever())

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
        try:
            await run_in_threadpool(lambda: self.flush(force=True))
        except Exception:
            logger.exception("Final quiz room save failed")
