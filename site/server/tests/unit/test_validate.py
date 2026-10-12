"""Payload and body validation (build-contracts.md section 10)."""

from __future__ import annotations

import gzip
import json
from pathlib import Path
from typing import Any

import pytest

from app.catalog import Catalog, Hub, load_catalog
from app.errors import ApiError
from app.progress import validate as v
from app.progress.validate import Limits, Rejected
from app.store.base import PartIn
from tests.support import HUB_SPECS, make_build

NOW = 1_760_000_000_000
SKEW = 900_000
LIMITS = Limits(now_ms=NOW, clock_skew_ms=SKEW, max_part_gz=131_072, max_doc_gz=393_216)

STATIC_SPEC = {
    "id": "plain",
    "slug": "plain-hub",
    "title": "Plain Hub",
    "engine": "static",
    "downloadName": "Plain Hub.html",
    "legacyKeys": [],
}


@pytest.fixture(scope="module")
def catalog(tmp_path_factory: pytest.TempPathFactory) -> Catalog:
    root: Path = tmp_path_factory.mktemp("build")
    make_build(root, [*HUB_SPECS, STATIC_SPEC])
    return load_catalog(root)


@pytest.fixture(scope="module")
def v2(catalog: Catalog) -> Hub:
    return catalog.by_id["ai103"]


@pytest.fixture(scope="module")
def legacy(catalog: Catalog) -> Hub:
    return catalog.by_id["ai901"]


def main(hub: str = "ai103", upd: Any = NOW, **extra: Any) -> dict[str, Any]:
    return {"hub": hub, "upd": upd, "S": {"v": 2, "done": {"m1": True, "m2": False, "m3": 1}}, **extra}


def legacy_part(raw: Any = None, **over: Any) -> dict[str, Any]:
    if raw is None:
        raw = json.dumps({"done": {"a": True, "b": True, "c": False}, "plan": {}})
    return {"hub": "ai901", "upd": NOW, "key": "ai901hub.v1", "raw": raw, **over}


# -- engines and hubs ----------------------------------------------------------------


def test_parts_by_engine(catalog: Catalog) -> None:
    assert v.parts_for(catalog.by_id["ai103"]) == ("main", "mocks", "cards")
    assert v.parts_for(catalog.by_id["ai901"]) == ("legacy",)
    assert v.parts_for(catalog.by_id["plain"]) == ()


@pytest.mark.parametrize("hub_id", ["nope", "plain", "AI103", "ai-103"])
def test_unknown_or_static_hub_is_404(catalog: Catalog, hub_id: str) -> None:
    with pytest.raises(ApiError) as caught:
        v.syncable_hub(catalog, hub_id)
    assert (caught.value.status_code, caught.value.code) == (404, "not_found")


def test_missing_catalog_is_503() -> None:
    with pytest.raises(ApiError) as caught:
        v.syncable_hub(None, "ai103")
    assert caught.value.status_code == 503


# -- known ---------------------------------------------------------------------------


def test_parse_known() -> None:
    parts = ("main", "mocks", "cards")
    assert v.parse_known(None, parts) == {}
    assert v.parse_known("", parts) == {}
    assert v.parse_known("main:5,mocks:0,cards:17", parts) == {"main": 5, "mocks": 0, "cards": 17}
    assert v.parse_known("main:5,legacy:9", parts) == {"main": 5}  # other engines' parts ignored
    assert v.parse_known("legacy:9", ("legacy",)) == {"legacy": 9}


@pytest.mark.parametrize("value", ["main", "main:", "main:x", "main:-1", "bogus:1", "main:1.5", "x" * 300])
def test_parse_known_rejects(value: str) -> None:
    with pytest.raises(ApiError) as caught:
        v.parse_known(value, ("main",))
    assert (caught.value.status_code, caught.value.code) == (422, "invalid")


# -- shapes --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("part", "payload"),
    [
        ("main", main()),
        ("mocks", {"hub": "ai103", "upd": NOW, "list": [{"pct": 80}] * 40}),
        ("cards", {"hub": "ai103", "upd": NOW, "map": {}}),
        ("main", main(upd=v.MIN_UPD)),
    ],
)
def test_valid_v2_parts(v2: Hub, part: str, payload: dict[str, Any]) -> None:
    assert v.shape_problem(v2, part, payload) is None


@pytest.mark.parametrize(
    ("part", "payload", "fragment"),
    [
        ("main", main(hub="ai901"), "hub"),  # hub mismatch
        ("main", main(hub=None), "hub"),
        ("main", {"hub": "ai103", "upd": NOW}, "S"),
        ("main", {"hub": "ai103", "upd": NOW, "S": []}, "S"),
        ("main", main(upd=v.MIN_UPD - 1), "upd"),
        ("main", main(upd=float(NOW)), "upd"),
        ("main", main(upd=str(NOW)), "upd"),
        ("main", main(upd=True), "upd"),
        ("main", main(upd=None), "upd"),
        ("main", [], "object"),
        ("mocks", {"hub": "ai103", "upd": NOW, "list": [{}] * 41}, "40"),
        ("mocks", {"hub": "ai103", "upd": NOW, "list": {}}, "list"),
        ("cards", {"hub": "ai103", "upd": NOW, "map": []}, "map"),
    ],
)
def test_invalid_v2_parts(v2: Hub, part: str, payload: Any, fragment: str) -> None:
    problem = v.shape_problem(v2, part, payload)
    assert problem is not None
    assert fragment in problem


@pytest.mark.parametrize(
    ("payload", "fragment"),
    [
        (legacy_part(key="studyhub.ai103.v2"), "key"),
        (legacy_part(raw=5), "string"),
        (legacy_part(raw="[1,2]"), "object"),
        (legacy_part(raw="{not json"), "JSON"),
        (legacy_part(raw='{"x": NaN}'), "JSON"),
        (legacy_part(hub="ai103"), "hub"),
    ],
)
def test_invalid_legacy_parts(legacy: Hub, payload: Any, fragment: str) -> None:
    problem = v.shape_problem(legacy, "legacy", payload)
    assert problem is not None
    assert fragment in problem


def test_done_counts(v2: Hub, legacy: Hub) -> None:
    encoded = v.encode_part(v2, "main", main(), LIMITS)
    assert isinstance(encoded, PartIn)
    assert encoded.done == 2  # True and 1 are truthy, False is not
    encoded = v.encode_part(legacy, "legacy", legacy_part(), LIMITS)
    assert isinstance(encoded, PartIn)
    assert encoded.done == 2
    cards = v.encode_part(v2, "cards", {"hub": "ai103", "upd": NOW, "map": {}}, LIMITS)
    assert isinstance(cards, PartIn)
    assert cards.done is None


def test_encoding_is_compact_utf8_gzip(v2: Hub) -> None:
    payload = main(S={"note": "café — ü", "done": {}})
    encoded = v.encode_part(v2, "main", payload, LIMITS)
    assert isinstance(encoded, PartIn)
    raw = gzip.decompress(encoded.gz)
    assert raw == json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode()
    assert "café".encode() in raw  # ensure_ascii=False
    assert encoded.raw_len == len(raw)
    assert encoded.upd == NOW
    assert v.decode_gz(encoded.gz) == payload


def test_part_over_max_part_gz_is_too_large(v2: Hub) -> None:
    import random

    rng = random.Random(7)
    noise = "".join(rng.choice("abcdefghijklmnopqrstuvwxyz0123456789") for _ in range(4000))
    small = Limits(NOW, SKEW, max_part_gz=1000, max_doc_gz=393_216)
    result = v.encode_part(v2, "main", main(S={"blob": noise}), small)
    assert result == Rejected("too_large", "part is too large")


def test_lone_surrogate_is_invalid(v2: Hub) -> None:
    result = v.encode_part(v2, "main", main(S={"x": "\ud800"}), LIMITS)
    assert isinstance(result, Rejected)
    assert result.code == "invalid"


# -- whole bodies --------------------------------------------------------------------


def body(**hubs: Any) -> dict[str, Any]:
    return {"hubs": hubs}


def test_parse_sync_batches(catalog: Catalog) -> None:
    batches = v.parse_sync(
        body(
            ai103={"main": main(), "cards": {"hub": "ai103", "upd": NOW, "map": []}},
            ai901={"legacy": legacy_part()},
        ),
        catalog,
        LIMITS,
    )
    assert [b.hub.id for b in batches] == ["ai103", "ai901"]
    assert batches[0].order == ["main", "cards"]
    assert set(batches[0].parts) == {"main"}
    assert batches[0].rejected["cards"].code == "invalid"
    assert set(batches[1].parts) == {"legacy"}


@pytest.mark.parametrize(
    "data",
    [
        [],
        {},
        {"hubs": []},
        {"hubs": {"ai103": []}},
        {"hubs": {"ai103": {"legacy": legacy_part()}}},  # part of another engine
        {"hubs": {"ai103": {"bogus": {}}}},
        {"hubs": {f"h{i}": {} for i in range(26)}},  # more than 25 hubs
    ],
)
def test_parse_sync_request_level_invalid(catalog: Catalog, data: Any) -> None:
    with pytest.raises(ApiError) as caught:
        v.parse_sync(data, catalog, LIMITS)
    assert (caught.value.status_code, caught.value.code) == (422, "invalid")


def test_parse_sync_unknown_hub_is_404(catalog: Catalog) -> None:
    with pytest.raises(ApiError) as caught:
        v.parse_sync(body(nope={"main": main()}), catalog, LIMITS)
    assert caught.value.status_code == 404


def test_clock_skew_fails_the_whole_request(catalog: Catalog) -> None:
    ahead = main(upd=NOW + SKEW + 1)
    with pytest.raises(ApiError) as caught:
        v.parse_sync(body(ai901={"legacy": legacy_part()}, ai103={"main": ahead}), catalog, LIMITS)
    assert (caught.value.status_code, caught.value.code) == (422, "clock_skew")
    # Exactly at the limit is fine.
    batches = v.parse_sync(body(ai103={"main": main(upd=NOW + SKEW)}), catalog, LIMITS)
    assert set(batches[0].parts) == {"main"}


def test_doc_over_max_doc_gz_rejects_all_parts(catalog: Catalog) -> None:
    import random

    rng = random.Random(1)
    noise = "".join(rng.choice("abcdefghijklmnopqrstuvwxyz") for _ in range(3000))
    tight = Limits(NOW, SKEW, max_part_gz=3000, max_doc_gz=3500)
    batches = v.parse_sync(
        body(
            ai103={
                "main": main(S={"a": noise}),
                "cards": {"hub": "ai103", "upd": NOW, "map": {"b": noise[::-1]}},
            }
        ),
        catalog,
        tight,
    )
    assert batches[0].parts == {}
    assert {p: r.code for p, r in batches[0].rejected.items()} == {"main": "too_large", "cards": "too_large"}


def test_strict_json() -> None:
    assert v.loads(b'{"a": 1}') == {"a": 1}
    for bad in (b"{", b'{"a": NaN}', b"[Infinity]", b"\xff", b"[" * 100_000 + b"]" * 100_000):
        with pytest.raises(ApiError) as caught:
            v.loads(bad)
        assert caught.value.code == "invalid"


# -- gzip bodies ---------------------------------------------------------------------


def test_gunzip_round_trip_and_multi_member() -> None:
    data = b"x" * 5000
    assert v.gunzip_bounded(gzip.compress(data), 10_000) == data
    assert v.gunzip_bounded(gzip.compress(b"ab") + gzip.compress(b"cd"), 10) == b"abcd"


def test_gzip_bomb_is_bounded() -> None:
    bomb = gzip.compress(b"\0" * (64 * 1024 * 1024))  # 64 MiB of zeros in ~64 KB
    assert len(bomb) < 100_000
    with pytest.raises(ApiError) as caught:
        v.gunzip_bounded(bomb, 8 * 1024 * 1024)
    assert (caught.value.status_code, caught.value.code) == (413, "too_large")


def test_gzip_exactly_at_limit_is_fine() -> None:
    data = b"y" * 4096
    assert v.gunzip_bounded(gzip.compress(data), 4096) == data
    with pytest.raises(ApiError):
        v.gunzip_bounded(gzip.compress(data), 4095)


@pytest.mark.parametrize("blob", [b"not gzip", gzip.compress(b"x" * 100)[:-6], b""])
def test_corrupt_or_truncated_gzip_is_invalid(blob: bytes) -> None:
    with pytest.raises(ApiError) as caught:
        v.gunzip_bounded(blob, 1000)
    assert (caught.value.status_code, caught.value.code) == (422, "invalid")
