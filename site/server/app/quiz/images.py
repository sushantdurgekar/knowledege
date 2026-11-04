"""Images for quiz questions and slides.

The studio shrinks a picture in the browser (at most 1280 px, JPEG/WebP) and uploads it here.
Each image is one settings document `quiz-img:<id>` (any store backend), where the id is the
first 24 hex digits of its SHA-256: uploading the same picture twice stores it once, and the
id doubles as a cache key (served `immutable`). Quizzes only hold the id, so they stay small.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import re
from typing import Any

from app.store.base import Store

MAX_IMAGE_BYTES = 400_000
TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_DATA_URL = re.compile(r"^data:(image/[a-z+]+);base64,([A-Za-z0-9+/=]+)$")
_MAGIC = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/gif": (b"GIF87a", b"GIF89a"),
    "image/webp": (b"RIFF",),
}


class ImageError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status, self.message = status, message


def key(image_id: str) -> str:
    return f"quiz-img:{image_id}"


def save_image(store: Store, data_url: Any) -> str:
    found = _DATA_URL.fullmatch(data_url) if isinstance(data_url, str) else None
    if found is None:
        raise ImageError(422, "Send the image as a data: URL (JPEG, PNG, WebP or GIF)")
    mime, b64 = found.groups()
    if mime not in TYPES:
        raise ImageError(422, "Only JPEG, PNG, WebP and GIF images are supported")
    try:
        raw = base64.b64decode(b64, validate=True)
    except binascii.Error:
        raise ImageError(422, "The image data is not valid base64") from None
    if len(raw) > MAX_IMAGE_BYTES:
        raise ImageError(413, "The image is larger than 400 KB even after shrinking")
    if not raw.startswith(_MAGIC[mime]) or (mime == "image/webp" and raw[8:12] != b"WEBP"):
        raise ImageError(422, "The file does not look like the image type it claims")
    image_id = hashlib.sha256(raw).hexdigest()[:24]
    if store.get_setting(key(image_id)) is None:
        store.put_setting(key(image_id), {"mime": mime, "b64": b64}, expect_version=None)
    return image_id


def load_image(store: Store, image_id: str) -> tuple[str, bytes] | None:
    if not re.fullmatch(r"[a-f0-9]{24}", image_id):
        return None
    found = store.get_setting(key(image_id))
    if found is None or not isinstance(found[0].get("b64"), str):
        return None
    return found[0]["mime"], base64.b64decode(found[0]["b64"])
