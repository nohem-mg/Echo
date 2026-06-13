"""Integration test: real BasicPitch model, real audio files.

Loads real fixtures from tests/resources/ (a C major arpeggio), in both WAV and
MP3, and checks end-to-end transcription via /convert.
Skipped automatically if basic-pitch is not installed.
"""

from __future__ import annotations

import mimetypes
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

pytest.importorskip("basic_pitch")

# Shared audio fixtures, one level above the services (backend/fixtures/audio).
RESOURCES = Path(__file__).resolve().parents[3] / "fixtures/audio"


@pytest.fixture(scope="module")
def real_client() -> TestClient:
    from app.main import app

    with TestClient(app) as c:  # triggers the real model warmup
        yield c


@pytest.mark.parametrize("filename", ["arpeggio.wav", "arpeggio.mp3"])
def test_convert_real_audio(real_client, filename):
    path = RESOURCES / filename
    assert path.exists(), f"missing fixture: {path}"
    mime = mimetypes.guess_type(filename)[0] or "application/octet-stream"

    with path.open("rb") as f:
        r = real_client.post("/convert", files={"file": (filename, f, mime)})

    assert r.status_code == 200, r.text
    seq = r.json()["midi_sequence"]

    # The arpeggio has 4 distinct notes: the model should transcribe several.
    assert seq["n_notes"] >= 2
    assert seq["tempo_bpm_estimate"] is None  # Step 1 converts, doesn't analyze
    for note in seq["notes"]:
        assert 0 <= note["pitch"] <= 127
        assert 1 <= note["velocity"] <= 127
        assert note["end_s"] >= note["start_s"]
