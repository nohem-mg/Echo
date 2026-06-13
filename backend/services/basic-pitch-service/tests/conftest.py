"""Test fixtures.

We NEVER load the real ML model here: too heavy and out of scope for a unit test
of the transport layer. We patch the service and the duration probe.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import service as service_module
from app.core import audio as audio_module
from app.schemas.midi import MidiSequence, ModelInfo, NoteEvent


@pytest.fixture
def fake_sequence() -> MidiSequence:
    notes = [NoteEvent(start_s=0.5, end_s=0.92, pitch=60, velocity=84)]
    return MidiSequence(notes=notes, duration_s=0.92, n_notes=1)


@pytest.fixture
def client(monkeypatch, fake_sequence) -> TestClient:
    # The model is not loaded, and convert() returns a fake sequence.
    monkeypatch.setattr(service_module.BasicPitchService, "warmup", lambda self: None)
    monkeypatch.setattr(
        service_module.BasicPitchService,
        "convert",
        lambda self, path: (fake_sequence, ModelInfo(backend="fake", version="test")),
    )
    # The duration probe does not open librosa on a fake file.
    monkeypatch.setattr(audio_module, "enforce_duration", lambda path, maxd: 0.92)

    from app.main import create_app

    with TestClient(create_app()) as c:
        yield c
