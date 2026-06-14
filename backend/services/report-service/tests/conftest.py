"""Shared pytest fixtures."""

from __future__ import annotations

import pytest
import os
from unittest.mock import patch, MagicMock

os.environ["ECHO_REPORT_GROQ_API_KEY"] = "test_key"

from fastapi.testclient import TestClient
from app.main import app

@pytest.fixture
def mock_groq():
    with patch("app.service.ReportService._call_groq") as mock_call:
        mock_call.return_value = "Mocked AI summary."
        yield mock_call

@pytest.fixture
def client(mock_groq):
    with TestClient(app) as c:
        yield c
