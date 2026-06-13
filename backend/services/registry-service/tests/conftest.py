"""Test fixtures. No database: settings.database_url is empty -> in-memory registry."""

from __future__ import annotations

from typing import Generator

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    from app.main import app

    with TestClient(app) as c:  # in-memory registry (no ECHO_REGISTRY_DATABASE_URL)
        yield c
