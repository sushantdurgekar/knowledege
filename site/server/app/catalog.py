"""The hub catalog the collector writes to HUBS_DIR (build-contracts.md sections 1 and 3).

`catalog.internal.json` is the source of truth for routing: it maps slugs and ids to
hub folders and carries each hub's CSP header. Entries are validated here, and an
invalid entry is skipped (logged) instead of taking the whole site down. A hub is
never served without its CSP.
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType
from typing import Any

from app.precompressed import StaticAsset

logger = logging.getLogger(__name__)

INTERNAL_CATALOG = "catalog.internal.json"
PUBLIC_CATALOG = "catalog.json"
HTML = "text/html; charset=utf-8"

ID_RE = re.compile(r"[a-z0-9][a-z0-9-]{1,40}")
SLUG_RE = re.compile(r"[a-z0-9][a-z0-9-]{0,79}")
SHA256_RE = re.compile(r"[0-9a-f]{64}")
# Printable ASCII only: the value goes straight into a response header.
# All patterns are used with fullmatch (a `$` anchor would accept a trailing newline).
HEADER_VALUE_RE = re.compile(r"[\x20-\x7e]+")
RESERVED_SLUGS = frozenset({"admin", "api", "assets", "_sh", "h", "signin", "account"})
ENGINES = frozenset({"v2", "legacy", "static"})


class CatalogError(Exception):
    """The catalog cannot be loaded at all (missing or unreadable)."""


@dataclass(frozen=True, slots=True)
class Hub:
    id: str
    slug: str
    title: str
    engine: str
    csp: str
    download_name: str
    sha256: str | None  # of the original bytes, as the collector recorded it
    legacy_keys: tuple[str, ...]
    served: StaticAsset  # hubs/<slug>/index.html (+ .br/.gz): bridge injected
    original: StaticAsset  # hubs/<slug>/original.html (+ .br/.gz): exact original bytes


@dataclass(frozen=True, slots=True)
class Catalog:
    hubs: tuple[Hub, ...]
    by_slug: Mapping[str, Hub]
    by_id: Mapping[str, Hub]
    public: StaticAsset | None  # catalog.json (+ .br/.gz)
    generated_at: str | None = None

    def lookup(self, name: str) -> tuple[Hub | None, bool]:
        """Find a hub by URL segment. Returns (hub, is_canonical).

        An exact slug is canonical. An id, or a slug/id in another letter case, finds
        the hub but should be redirected to the canonical slug.
        """
        hub = self.by_slug.get(name)
        if hub is not None:
            return hub, True
        folded = name.lower()
        hub = self.by_slug.get(folded) or self.by_id.get(folded)
        return hub, False


def _entries(document: Any) -> list[Any]:
    # The contract shape is {version, generatedAt, hubs: [...]}; accept a bare list too.
    if isinstance(document, dict) and isinstance(document.get("hubs"), list):
        return document["hubs"]
    if isinstance(document, list):
        return document
    raise CatalogError(f"{INTERNAL_CATALOG} must be an object with a 'hubs' list")


def _str(entry: Mapping[str, Any], key: str) -> str | None:
    value = entry.get(key)
    return value if isinstance(value, str) and value else None


def _build_hub(entry: Any, hubs_root: Path) -> Hub:
    """Validate one internal catalog entry; raises ValueError with the reason."""
    if not isinstance(entry, dict):
        raise ValueError("entry is not an object")
    hub_id, slug = _str(entry, "id"), _str(entry, "slug")
    if hub_id is None or not ID_RE.fullmatch(hub_id):
        raise ValueError(f"invalid id {hub_id!r}")
    if slug is None or not SLUG_RE.fullmatch(slug) or slug in RESERVED_SLUGS:
        raise ValueError(f"invalid or reserved slug {slug!r}")
    engine = _str(entry, "engine") or "static"
    if engine not in ENGINES:
        raise ValueError(f"unknown engine {engine!r}")
    csp = _str(entry, "csp")
    if csp is None or not HEADER_VALUE_RE.fullmatch(csp):
        raise ValueError("missing or malformed csp")

    # slug matched SLUG_RE above, so this join cannot leave hubs_root.
    folder = hubs_root / slug
    served = StaticAsset.probe(folder / "index.html", HTML)
    original = StaticAsset.probe(folder / "original.html", HTML)
    if served is None or original is None:
        raise ValueError(f"missing hubs/{slug}/index.html or original.html")

    sha256 = _str(entry, "sha256")
    legacy_keys = entry.get("legacyKeys")
    if not isinstance(legacy_keys, list):
        legacy_keys = []
    return Hub(
        id=hub_id,
        slug=slug,
        title=_str(entry, "title") or slug,
        engine=engine,
        csp=csp,
        download_name=_str(entry, "downloadName") or f"{slug}.html",
        sha256=sha256.lower() if sha256 and SHA256_RE.fullmatch(sha256.lower()) else None,
        legacy_keys=tuple(key for key in legacy_keys if isinstance(key, str)),
        served=served,
        original=original,
    )


def load_catalog(hubs_dir: Path) -> Catalog:
    """Load and validate HUBS_DIR/catalog.internal.json. Raises CatalogError if unusable."""
    path = hubs_dir / INTERNAL_CATALOG
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise CatalogError(f"{path} not found (run the collector)") from None
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise CatalogError(f"{path} is unreadable: {exc}") from exc

    hubs: list[Hub] = []
    by_slug: dict[str, Hub] = {}
    by_id: dict[str, Hub] = {}
    for index, entry in enumerate(_entries(document)):
        try:
            hub = _build_hub(entry, hubs_dir / "hubs")
        except ValueError as exc:
            logger.error("Skipping catalog entry %d: %s", index, exc)
            continue
        if hub.slug in by_slug or hub.id in by_id:
            logger.error("Skipping catalog entry %d: duplicate id %r or slug %r", index, hub.id, hub.slug)
            continue
        hubs.append(hub)
        by_slug[hub.slug] = hub
        by_id[hub.id] = hub

    generated_at = document.get("generatedAt") if isinstance(document, dict) else None
    return Catalog(
        hubs=tuple(hubs),
        by_slug=MappingProxyType(by_slug),
        by_id=MappingProxyType(by_id),
        public=StaticAsset.probe(hubs_dir / PUBLIC_CATALOG, "application/json"),
        generated_at=generated_at if isinstance(generated_at, str) else None,
    )
