"""Test fixtures.

We never hit the real SoundCloud network: the single HTTP call lives in
``SoundCloudService._upload_to_api`` and tests patch it with a canned payload.
"""

from __future__ import annotations

import pytest
from typing import Generator
from fastapi.testclient import TestClient


# Canonical canned SoundCloud API response (matches real API shape).
SC_TRACK_PAYLOAD = {
    "id": 123456789,
    "permalink": "my-sealed-track",
    "permalink_url": "https://soundcloud.com/echo-artist/my-sealed-track",
    "title": "My Sealed Track",
    "sharing": "private",
}


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    from app.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture
def patch_upload(monkeypatch):
    """Return a setter that makes _upload_to_api resolve to a given payload."""
    from app.service import SoundCloudService

    def _set(payload: dict) -> None:
        async def _fake(self, audio_path, metadata) -> dict:
            return payload

        monkeypatch.setattr(SoundCloudService, "_upload_to_api", _fake)

    return _set


@pytest.fixture
def patch_upload_error(monkeypatch):
    """Make _upload_to_api raise UpstreamError."""
    from app.service import SoundCloudService
    from echo_common.errors import UpstreamError

    async def _fail(self, audio_path, metadata) -> dict:
        raise UpstreamError("SoundCloud returned 500.")

    monkeypatch.setattr(SoundCloudService, "_upload_to_api", _fail)
