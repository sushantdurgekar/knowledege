"""Plain-text logging for the `app.*` loggers.

Uvicorn configures its own `uvicorn.*` loggers; ours propagate to the root logger,
which gets one stderr handler unless something (pytest, a host) already set one.
"""

from __future__ import annotations

import logging

LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s: %(message)s"


def configure_logging(level: str) -> None:
    root = logging.getLogger()
    if not root.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter(LOG_FORMAT))
        root.addHandler(handler)
    logging.getLogger("app").setLevel(level)
