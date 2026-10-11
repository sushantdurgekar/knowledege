"""Route-type predicates shared by middleware and routes (all take the decoded ASGI path)."""

from __future__ import annotations


def is_api_path(path: str) -> bool:
    return path == "/api" or path.startswith("/api/")


def is_hub_path(path: str) -> bool:
    """Hub documents and downloads live under /h/."""
    return path == "/h" or path.startswith("/h/")
