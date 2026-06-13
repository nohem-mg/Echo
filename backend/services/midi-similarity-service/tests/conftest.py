"""Test fixtures.

midi-similarity owns no data: it fetches intervals from registry-service. Tests
inject a stub provider (the `registry` fixture) so they never hit the network.
"""

from __future__ import annotations

from typing import Generator

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def registry() -> dict[str, list[int]]:
    """Mutable stand-in for the registry's stored intervals: track_id -> intervals."""
    return {}


@pytest.fixture
def client(registry) -> Generator[TestClient, None, None]:
    from app.main import app
    from app.service import MidiSimilarityService
    from app.config import settings

    async def provider() -> list[tuple[str, list[int]]]:
        return list(registry.items())

    with TestClient(app) as c:
        # Replace the HTTP-backed provider with the in-memory stub.
        c.app.state.service = MidiSimilarityService(provider, settings)
        yield c
