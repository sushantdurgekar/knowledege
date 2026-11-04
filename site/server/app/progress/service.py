"""Progress reads and writes on top of the store, with the quota guard around them.

Synchronous (store calls block): routes run these in the thread pool.

- `get_parts`: the hub's parts for GET /api/progress and the legacy seed; a part comes
  back as its payload, as a stub `{"stub": true, "upd": n}` when the server copy is
  not newer than `known`, or as None when there is none. 1 read, plus 1 only when
  some part is newer than `known` (and 1 in all when nothing is known yet).
- `sync`: one transaction per hub (`Store.put_parts`, newest wins), then the
  per-user write count. A hub costs 1 read + at most 1 write, however many parts
  (+1 read on its first write: the store checks the uid's tombstone).

Store failures map onto API errors: `QuotaExhausted` trips the guard's breaker
(sync: 429 `sync_paused`; reads: 503 `unavailable`), `Unavailable` is 503, and a
`TooLarge` write rejects that hub's parts with `too_large`. `AccountDeleted` (a deleted
account's other device) propagates: the route signs that session out.
"""

from __future__ import annotations

import logging
from typing import Any

from app.catalog import Hub
from app.errors import ApiError
from app.progress.validate import HubBatch, Rejected, decode_gz, parts_for
from app.quota.guard import Guard
from app.store.base import PartResult, QuotaExhausted, Store, TooLarge, Unavailable

logger = logging.getLogger(__name__)

UNAVAILABLE_RETRY_S = 15


def unavailable() -> ApiError:
    return ApiError(503, "unavailable", "Sync is unavailable right now", retry_after=UNAVAILABLE_RETRY_S)


class ProgressService:
    def __init__(self, store: Store, guard: Guard) -> None:
        self._store = store
        self._guard = guard

    def get_parts(self, uid: str, hub: Hub, known: dict[str, int]) -> dict[str, Any]:
        try:
            stored = self._store.get_hub(uid, hub.id, known)
        except QuotaExhausted as exc:
            until = self._guard.trip(exc.kind, exc.retry_at)
            raise ApiError(
                503, "unavailable", "Sync is paused until the quota resets", retry_at=until
            ) from exc
        except Unavailable as exc:
            logger.warning("get_hub failed: %s", exc)
            raise unavailable() from exc
        self._guard.note_success("reads")
        out: dict[str, Any] = {}
        for part in parts_for(hub):
            found = stored.get(part)
            if found is None:
                out[part] = None
            elif found.gz is None:
                out[part] = {"stub": True, "upd": found.upd}
            else:
                out[part] = decode_gz(found.gz)
        return out

    def sync(self, uid: str, batches: list[HubBatch], now_ms: int) -> dict[str, dict[str, Any]]:
        results: dict[str, dict[str, Any]] = {}
        writes = 0
        try:
            for batch in batches:
                stored: dict[str, PartResult] = {}
                if batch.parts:
                    stored = self._put(uid, batch, now_ms)
                    if any(r.status == "accepted" for r in stored.values()):
                        writes += 1
                hub_results: dict[str, Any] = {}
                for part in batch.order:
                    rejected = batch.rejected.get(part)
                    if rejected is not None:
                        hub_results[part] = {"status": "rejected", "upd": 0, "code": rejected.code}
                    else:
                        result = stored[part]
                        hub_results[part] = {"status": result.status, "upd": result.upd}
                results[batch.hub.id] = hub_results
        finally:
            self._guard.record_user_writes(uid, writes)
        return results

    def _put(self, uid: str, batch: HubBatch, now_ms: int) -> dict[str, PartResult]:
        try:
            stored = self._store.put_parts(uid, batch.hub.id, batch.parts, now_ms)
        except TooLarge:
            logger.warning("Hub document too large for %s", batch.hub.id)
            for part in list(batch.parts):
                batch.rejected[part] = Rejected("too_large", "hub document is too large")
            batch.parts.clear()
            return {}
        except QuotaExhausted as exc:
            until = self._guard.trip(exc.kind, exc.retry_at)
            raise ApiError(
                429, "sync_paused", "Sync is paused until the quota resets", retry_at=until
            ) from exc
        except Unavailable as exc:
            logger.warning("put_parts failed: %s", exc)
            raise unavailable() from exc
        self._guard.note_success("reads")
        if any(r.status == "accepted" for r in stored.values()):
            self._guard.note_success("writes")
        return stored
