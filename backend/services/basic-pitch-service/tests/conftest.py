"""Test fixtures.

We NEVER load the real ML model here: too heavy and out of scope for a unit test
of the transport layer. We patch the service and the duration probe.
"""

from __future__ import annotations

import pytest
from typing import Generator
from fastapi.testclient import TestClient

from echo_common import audio as audio_module
from echo_common.schemas.midi import MidiSequence, NoteEvent

from app import service as service_module
from app.schemas import ModelInfo


@pytest.fixture
def fake_sequence() -> MidiSequence:
    notes = [NoteEvent(start_s=0.5, end_s=0.92, pitch=60, velocity=84)]
    return MidiSequence(notes=notes, duration_s=0.92, n_notes=1)


@pytest.fixture
def client(monkeypatch, fake_sequence) -> Generator[TestClient, None, None]:
    # The model is not loaded, and convert() returns a fake sequence.

    monkeypatch.setattr(service_module.BasicPitchService, "warmup", lambda self: None)
    monkeypatch.setattr(
        service_module.BasicPitchService,
        "convert",
        lambda self, path: (fake_sequence, ModelInfo(backend="fake", version="test")),
    )
    # The duration probe does not open librosa on a fake file.
    monkeypatch.setattr(audio_module, "enforce_duration", lambda path, maxd: 0.92)

    from app.main import app

    with TestClient(app) as c:
        yield c
