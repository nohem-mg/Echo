"""Test fixtures.

We never hit the real ACRCloud network: the single HTTP call lives in
``AcrCloudService._identify`` and tests patch it with a canned payload.
"""

from __future__ import annotations

import pytest
from typing import Generator
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def fake_fingerprint(monkeypatch):
    """Skip the native extractor in unit tests: stub the audio + humming fingerprints."""
    from app.service import AcrCloudService

    monkeypatch.setattr(
        AcrCloudService, "_fingerprints", lambda self, path: (b"FP", b"HUM")
    )


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    from app.main import app

    with TestClient(app) as c:
        yield c



@pytest.fixture
def patch_identify(monkeypatch):
    """Return a setter that makes _identify resolve to a given ACRCloud payload."""
    from app.service import AcrCloudService

    def _set(payload: dict) -> None:
        async def _fake(self, audio_fp: bytes, humming_fp: bytes | None) -> dict:
            return payload

        monkeypatch.setattr(AcrCloudService, "_identify", _fake)

    return _set
