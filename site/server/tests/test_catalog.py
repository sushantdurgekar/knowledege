"""Catalog loading and validation: bad entries are skipped, never served."""

from __future__ import annotations

import json
import logging
from typing import Any

import pytest

from app.catalog import CatalogError, load_catalog
from tests.support import FakeBuild


def test_loads_all_hubs(build: FakeBuild) -> None:
    catalog = load_catalog(build.root)
    assert [hub.slug for hub in catalog.hubs] == ["ai-103", "ai-901", "dsa-l1-foundation"]
    hub = catalog.by_slug["ai-901"]
    assert hub.id == "ai901"
    assert hub.engine == "legacy"
    assert hub.legacy_keys == ("ai901hub.v1",)
    assert hub.csp == build.entries["ai-901"]["csp"]
    assert set(hub.served.variants) == {"identity", "br", "gzip"}
    assert catalog.public is not None
    assert catalog.generated_at == "2026-10-11T00:00:00Z"


def test_lookup(build: FakeBuild) -> None:
    catalog = load_catalog(build.root)
    assert catalog.lookup("ai-103") == (catalog.by_slug["ai-103"], True)
    assert catalog.lookup("ai103") == (catalog.by_slug["ai-103"], False)
    assert catalog.lookup("AI-103") == (catalog.by_slug["ai-103"], False)
    assert catalog.lookup("nope") == (None, False)


def test_bare_list_is_accepted(build: FakeBuild) -> None:
    build.write_internal(list(build.entries.values()))
    assert len(load_catalog(build.root).hubs) == 3


def test_missing_catalog(tmp_path) -> None:
    with pytest.raises(CatalogError, match="not found"):
        load_catalog(tmp_path)


@pytest.mark.parametrize("content", ["{oops", '"a string"', '{"hubs": "nope"}', "\udcff"])
def test_unusable_catalog(build: FakeBuild, content: str) -> None:
    (build.root / "catalog.internal.json").write_bytes(content.encode("utf-8", "surrogateescape"))
    with pytest.raises(CatalogError):
        load_catalog(build.root)


def _with(build: FakeBuild, base: str, /, **changes: Any) -> dict[str, Any]:
    entry = {**build.entries[base], **changes}
    return {key: value for key, value in entry.items() if value is not None}


@pytest.mark.parametrize(
    "changes",
    [
        {"slug": "../ai-103"},
        {"slug": "ai-103/../x"},
        {"slug": "AI-103"},
        {"slug": "admin"},
        {"slug": "api"},
        {"slug": ""},
        {"id": "a"},  # too short
        {"id": "ai 103"},
        {"engine": "v3"},
        {"csp": None},
        {"csp": ""},
        {"csp": "default-src 'none'\r\nX-Injected: 1"},
        {"csp": "default-src 'none'\n"},  # a `$` anchor would have let this through
        {"slug": "ai-103\n"},
        {"id": "ai103\n"},
        {"csp": "default-src 'none'; img-src ü"},
        {"slug": "ai-999"},  # no files on disk for this slug
    ],
)
def test_invalid_entry_is_skipped(
    build: FakeBuild, changes: dict[str, Any], caplog: pytest.LogCaptureFixture
) -> None:
    good = [build.entries["ai-901"]]
    build.write_internal({"hubs": [_with(build, "ai-103", **changes), *good]})
    with caplog.at_level(logging.ERROR, logger="app.catalog"):
        catalog = load_catalog(build.root)
    assert [hub.slug for hub in catalog.hubs] == ["ai-901"]
    assert "Skipping catalog entry 0" in caplog.text


def test_duplicates_are_skipped(build: FakeBuild) -> None:
    first = build.entries["ai-103"]
    build.write_internal(
        {"hubs": [first, {**first, "id": "other"}, {**build.entries["ai-901"], "id": "ai103"}]}
    )
    catalog = load_catalog(build.root)
    assert [hub.id for hub in catalog.hubs] == ["ai103"]


def test_non_object_entries_are_skipped(build: FakeBuild) -> None:
    build.write_internal({"hubs": ["x", 3, None, build.entries["ai-103"]]})
    assert [hub.slug for hub in load_catalog(build.root).hubs] == ["ai-103"]


def test_defaults_for_optional_fields(build: FakeBuild) -> None:
    entry = {key: build.entries["ai-103"][key] for key in ("id", "slug", "csp")}
    build.write_internal({"hubs": [entry]})
    hub = load_catalog(build.root).by_slug["ai-103"]
    assert hub.engine == "static"
    assert hub.download_name == "ai-103.html"
    assert hub.title == "ai-103"
    assert hub.sha256 is None
    assert hub.legacy_keys == ()


def test_odd_optional_field_types_are_ignored(build: FakeBuild) -> None:
    entry = {**build.entries["ai-901"], "legacyKeys": "ai901hub.v1", "sha256": "XYZ", "title": 7}
    build.write_internal({"hubs": [entry]})
    hub = load_catalog(build.root).by_slug["ai-901"]
    assert hub.legacy_keys == ()
    assert hub.sha256 is None
    assert hub.title == "ai-901"


def test_sha_mismatch_is_logged_not_fatal(
    make_client, build: FakeBuild, caplog: pytest.LogCaptureFixture
) -> None:
    document = json.loads((build.root / "catalog.internal.json").read_text())
    document["hubs"][0]["sha256"] = "0" * 64
    build.write_internal(document)
    with caplog.at_level(logging.WARNING, logger="app.state"):
        client = make_client()
    assert "sha256" in caplog.text
    assert client.get("/h/ai-103").status_code == 200
