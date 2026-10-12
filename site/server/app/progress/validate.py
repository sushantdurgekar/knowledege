"""Request and payload validation for /api/progress and /api/sync (build-contracts.md section 10).

Parts by engine: `v2` -> main, mocks, cards; `legacy` -> legacy. A `static` hub does
not sync (404). Payloads are exactly what the hub builds:

    main    {hub, upd, S}        S is an object
    mocks   {hub, upd, list}     list is an array of at most 40 items
    cards   {hub, upd, map}      map is an object
    legacy  {hub, upd, key, raw} key is one of the hub's legacyKeys, raw a string that
                                 parses to a JSON object

- `hub` must equal the hub id; `upd` must be an integer in [1.6e12, now + CLOCK_SKEW_MS].
- A part that breaks these rules is `rejected` with code `invalid`; an `upd` above
  the skew limit fails the whole request with 422 `clock_skew` (the device clock is
  wrong, so nothing it sends can be ordered).
- Stored form: gzip of `json.dumps(payload, separators=(",", ":"), ensure_ascii=False)`.
  Over MAX_PART_GZ the part is rejected `too_large`; over MAX_DOC_GZ for the hub's
  parts together, all of them are.
- The body: at most MAX_BODY bytes on the wire and, with `Content-Encoding: gzip`, at
  most MAX_BODY_DECOMPRESSED after decompression (checked while inflating, so a gzip
  bomb never allocates more than the cap). At most 25 hubs.
"""

from __future__ import annotations

import gzip
import json
import zlib
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from starlette.requests import Request

from app.catalog import Catalog, Hub
from app.errors import ApiError
from app.store.base import PartIn

V2_PARTS: tuple[str, ...] = ("main", "mocks", "cards")
LEGACY_PARTS: tuple[str, ...] = ("legacy",)
MIN_UPD = 1_600_000_000_000
MAX_HUBS = 25
MAX_MOCKS = 40
GZIP_LEVEL = 6
_INFLATE_CHUNK = 64 * 1024


def parts_for(hub: Hub) -> tuple[str, ...]:
    if hub.engine == "v2":
        return V2_PARTS
    if hub.engine == "legacy":
        return LEGACY_PARTS
    return ()


def invalid(message: str) -> ApiError:
    return ApiError(422, "invalid", message)


def syncable_hub(catalog: Catalog | None, hub_id: str) -> Hub:
    """The catalog hub for `hub_id`, or 404 (unknown, or a static hub that never syncs)."""
    if catalog is None:
        raise ApiError(503, "unavailable", "The hub catalog is not available", retry_after=60)
    hub = catalog.by_id.get(hub_id)
    if hub is None or not parts_for(hub):
        raise ApiError(404, "not_found", "Unknown hub")
    return hub


# -- GET /api/progress?known= -------------------------------------------------------


def parse_known(value: str | None, allowed: tuple[str, ...]) -> dict[str, int]:
    """`main:<upd>,mocks:<upd>,cards:<upd>` -> {part: upd}. Parts of other engines are ignored."""
    known: dict[str, int] = {}
    if not value:
        return known
    if len(value) > 256:
        raise invalid("known is too long")
    for item in value.split(","):
        part, sep, number = item.strip().partition(":")
        if not sep or part not in V2_PARTS + LEGACY_PARTS or not number.isdigit() or len(number) > 16:
            raise invalid("known must look like main:<upd>,mocks:<upd>,cards:<upd>")
        if part in allowed:
            known[part] = int(number)
    return known


# -- the request body ---------------------------------------------------------------


def gunzip_bounded(data: bytes, limit: int) -> bytes:
    """Inflate gzip `data` (one or more members) without ever producing more than `limit` bytes."""
    out = bytearray()
    remaining = data
    try:
        while True:
            inflater = zlib.decompressobj(16 + zlib.MAX_WBITS)
            pending = remaining
            while not inflater.eof:
                piece = inflater.decompress(pending, _INFLATE_CHUNK)
                out += piece
                if len(out) > limit:
                    raise ApiError(413, "too_large", "Request body is too large once decompressed")
                pending = inflater.unconsumed_tail
                if not piece and not pending:
                    break
            if not inflater.eof:
                raise invalid("gzip body is truncated")
            remaining = inflater.unused_data
            if not remaining.strip(b"\x00"):
                return bytes(out)
    except zlib.error:
        raise invalid("gzip body is corrupt") from None


async def read_wire_body(request: Request, *, max_wire: int) -> bytes:
    """The raw request body as sent, refused (413) as soon as it passes `max_wire` bytes."""
    declared = request.headers.get("content-length")
    if declared is not None and declared.isdigit() and int(declared) > max_wire:
        raise ApiError(413, "too_large", "Request body is too large")
    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > max_wire:
            raise ApiError(413, "too_large", "Request body is too large")
        chunks.append(chunk)
    return b"".join(chunks)


def decode_body(raw: bytes, content_encoding: str | None, *, max_decompressed: int) -> bytes:
    """Undo `Content-Encoding: gzip` within `max_decompressed` bytes (CPU-bound: run in a thread)."""
    encoding = (content_encoding or "").strip().lower()
    if encoding in ("", "identity"):
        if len(raw) > max_decompressed:
            raise ApiError(413, "too_large", "Request body is too large")
        return raw
    if encoding == "gzip":
        return gunzip_bounded(raw, max_decompressed)
    raise ApiError(415, "unsupported_media_type", "Content-Encoding must be gzip or absent")


async def read_body(request: Request, *, max_wire: int, max_decompressed: int) -> bytes:
    """Small bodies (sign-in, test routes): read and decode in one step."""
    raw = await read_wire_body(request, max_wire=max_wire)
    return decode_body(raw, request.headers.get("content-encoding"), max_decompressed=max_decompressed)


def _reject_constant(name: str) -> Any:
    raise ValueError(f"{name} is not JSON")


def loads(data: bytes | str) -> Any:
    """Strict JSON: NaN/Infinity rejected, deep nesting rejected."""
    try:
        return json.loads(data, parse_constant=_reject_constant)
    except (ValueError, RecursionError, UnicodeDecodeError):
        raise invalid("Body is not valid JSON") from None


# -- parts ----------------------------------------------------------------------------


def compact_json(payload: Any) -> bytes:
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def encode_gz(raw: bytes) -> bytes:
    return gzip.compress(raw, compresslevel=GZIP_LEVEL, mtime=0)


def decode_gz(blob: bytes) -> Any:
    return json.loads(gzip.decompress(blob))


def is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def count_truthy(value: Any) -> int:
    if isinstance(value, dict):
        return sum(1 for item in value.values() if item)
    if isinstance(value, list):
        return sum(1 for item in value if item)
    return 0


def shape_problem(hub: Hub, part: str, payload: Any) -> str | None:
    """Why `payload` is not a valid `part` of `hub` (ignoring the skew limit), or None."""
    if not isinstance(payload, dict):
        return "payload must be an object"
    if payload.get("hub") != hub.id:
        return "payload.hub does not match the hub"
    upd = payload.get("upd")
    if not is_int(upd) or upd < MIN_UPD:
        return "upd must be an integer timestamp in ms"
    if part == "main" and not isinstance(payload.get("S"), dict):
        return "main.S must be an object"
    if part == "mocks":
        items = payload.get("list")
        if not isinstance(items, list) or len(items) > MAX_MOCKS:
            return f"mocks.list must be an array of at most {MAX_MOCKS} items"
    if part == "cards" and not isinstance(payload.get("map"), dict):
        return "cards.map must be an object"
    if part == "legacy":
        if payload.get("key") not in hub.legacy_keys:
            return "legacy.key is not this hub's storage key"
        raw = payload.get("raw")
        if not isinstance(raw, str):
            return "legacy.raw must be a string"
        try:
            parsed = json.loads(raw, parse_constant=_reject_constant)
        except (ValueError, RecursionError):
            return "legacy.raw must be JSON"
        if not isinstance(parsed, dict):
            return "legacy.raw must hold a JSON object"
    return None


def done_count(part: str, payload: dict[str, Any]) -> int | None:
    """Modules done: truthy entries of S.done (main) or of the raw record's done (legacy)."""
    if part == "main":
        return count_truthy(payload["S"].get("done"))
    if part == "legacy":
        return count_truthy(json.loads(payload["raw"]).get("done"))
    return None


@dataclass(frozen=True, slots=True)
class Rejected:
    code: str  # "invalid" | "too_large"
    message: str


@dataclass
class HubBatch:
    """One hub of a sync request: the parts to store and the parts already rejected."""

    hub: Hub
    order: list[str] = field(default_factory=list)  # parts in request order
    parts: dict[str, PartIn] = field(default_factory=dict)
    rejected: dict[str, Rejected] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class Limits:
    now_ms: int
    clock_skew_ms: int
    max_part_gz: int
    max_doc_gz: int


def encode_part(hub: Hub, part: str, payload: Any, limits: Limits) -> PartIn | Rejected:
    problem = shape_problem(hub, part, payload)
    if problem is not None:
        return Rejected("invalid", problem)
    try:
        raw = compact_json(payload)
    except (UnicodeEncodeError, ValueError):
        return Rejected("invalid", "payload is not encodable as UTF-8 JSON")
    gz = encode_gz(raw)
    if len(gz) > limits.max_part_gz:
        return Rejected("too_large", "part is too large")
    return PartIn(upd=payload["upd"], gz=gz, raw_len=len(raw), done=done_count(part, payload))


def parse_sync(data: Any, catalog: Catalog | None, limits: Limits) -> list[HubBatch]:
    """Validate a parsed `{"hubs": {...}}` body into per-hub batches.

    Request-level problems raise ApiError (422 invalid / clock_skew, 404 unknown hub);
    part-level problems become `Rejected` entries.
    """
    if not isinstance(data, dict) or not isinstance(data.get("hubs"), dict):
        raise invalid('Body must be {"hubs": {"<hubId>": {"<part>": payload}}}')
    hubs: Mapping[str, Any] = data["hubs"]
    if len(hubs) > MAX_HUBS:
        raise invalid(f"At most {MAX_HUBS} hubs per request")
    limit = limits.now_ms + limits.clock_skew_ms
    batches: list[HubBatch] = []
    for hub_id, parts in hubs.items():
        hub = syncable_hub(catalog, hub_id)
        if not isinstance(parts, dict):
            raise invalid(f"hubs.{hub_id} must be an object of parts")
        allowed = parts_for(hub)
        for part, payload in parts.items():
            if part not in allowed:
                raise invalid(f"hubs.{hub_id}: unknown part {part!r} for this hub")
            upd = payload.get("upd") if isinstance(payload, dict) else None
            if is_int(upd) and upd > limit:
                raise ApiError(
                    422, "clock_skew", "This device's clock is ahead of the server; nothing was saved"
                )
        batches.append(HubBatch(hub=hub, order=list(parts)))
    for batch in batches:
        for part in batch.order:
            encoded = encode_part(batch.hub, part, hubs[batch.hub.id][part], limits)
            if isinstance(encoded, Rejected):
                batch.rejected[part] = encoded
            else:
                batch.parts[part] = encoded
        if sum(len(p.gz) for p in batch.parts.values()) > limits.max_doc_gz:
            for part in list(batch.parts):
                batch.rejected[part] = Rejected("too_large", "hub document is too large")
            batch.parts.clear()
    return batches
