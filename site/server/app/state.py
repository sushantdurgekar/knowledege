"""Process-wide state: settings, the loaded catalog and the public-file allow-lists.

`create_app` attaches an `AppState` to `app.state.studyhubs`; the lifespan calls
`load()`. Routes read it through `get_state(request)`.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from starlette.requests import Request

from app.catalog import Catalog, CatalogError, load_catalog
from app.config import Settings
from app.precompressed import IDENTITY, AssetDirectory, FileHasher

if TYPE_CHECKING:
    from app.runtime import Runtime

logger = logging.getLogger(__name__)

# Dev servers pick up a rebuilt client within this many seconds; production images
# are immutable, so they never rescan.
DEV_RESCAN_SECONDS = 2.0


@dataclass(frozen=True, slots=True)
class PublicFiles:
    """Allow-lists for PUBLIC_DIR (the React build plus the bridge output)."""

    root: AssetDirectory  # index.html, favicon.svg, robots.txt, ...
    assets: AssetDirectory  # assets/** (Vite hashed files)
    sh: AssetDirectory  # _sh/bridge.js, _sh/fflate.js


@dataclass
class AppState:
    settings: Settings
    hasher: FileHasher = field(default_factory=FileHasher)
    catalog: Catalog | None = None
    catalog_error: str | None = "not loaded yet"
    public: PublicFiles | None = None
    runtime: Runtime | None = None  # M1 services (store, auth, quota), set by create_app

    def load(self) -> None:
        """Load the catalog and scan PUBLIC_DIR. Never raises for a missing build."""
        self._load_public()
        self._load_catalog()

    def _load_public(self) -> None:
        public_dir = self.settings.public_dir
        rescan = None if self.settings.is_production else DEV_RESCAN_SECONDS
        self.public = PublicFiles(
            root=AssetDirectory(public_dir, rescan_interval=rescan),
            assets=AssetDirectory(public_dir / "assets", recursive=True, rescan_interval=rescan),
            sh=AssetDirectory(public_dir / "_sh", rescan_interval=rescan),
        )
        if self.public.root.get("index.html") is None:
            logger.warning("No index.html in PUBLIC_DIR=%s: SPA routes will return 503", public_dir)
        for directory in (self.public.root, self.public.assets, self.public.sh):
            for _, asset in directory:
                self.hasher.warm(asset)

    def _load_catalog(self) -> None:
        try:
            catalog = load_catalog(self.settings.hubs_dir)
        except CatalogError as exc:
            self.catalog, self.catalog_error = None, str(exc)
            logger.warning("Hub catalog unavailable, /h/* will return 503: %s", exc)
            return
        for hub in catalog.hubs:
            self.hasher.warm(hub.served)
            self.hasher.warm(hub.original)
            actual = self.hasher.etag_for(hub.original.variants[IDENTITY]).strip('"')
            if hub.sha256 is not None and hub.sha256 != actual:
                logger.warning(
                    "Hub %s: original.html sha256 %s != catalog sha256 %s", hub.slug, actual, hub.sha256
                )
        if catalog.public is not None:
            self.hasher.warm(catalog.public)
        else:
            logger.warning("No catalog.json in HUBS_DIR=%s", self.settings.hubs_dir)
        self.catalog, self.catalog_error = catalog, None
        logger.info("Loaded %d hubs from %s", len(catalog.hubs), self.settings.hubs_dir)


def get_state(request: Request) -> AppState:
    state: AppState = request.app.state.studyhubs
    return state
