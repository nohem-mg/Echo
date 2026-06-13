"""Fingerprint extraction: proves the raw audio is never what gets sent.

Uses a real audio fixture and the real ACRCloud extractor (no network). Skipped
if pyacrcloud isn't installed.
"""

from __future__ import annotations

from pathlib import Path

import pytest

pytest.importorskip("acrcloud.acrcloud_extr_tool")

# Shared audio fixtures (backend/fixtures/audio).
AUDIO = Path(__file__).resolve().parents[3] / "fixtures/audio/arpeggio.mp3"


def test_fingerprint_is_compact_and_not_the_audio():
    from app.config import settings
    from app.service import AcrCloudService

    assert AUDIO.exists(), f"missing fixture: {AUDIO}"
    audio_bytes = AUDIO.read_bytes()

    audio_fp, humming_fp = AcrCloudService(settings)._fingerprints(AUDIO)

    assert isinstance(audio_fp, bytes) and len(audio_fp) > 0
    # The fingerprint is opaque acoustic landmarks, not the audio itself.
    assert audio_fp != audio_bytes
    assert audio_bytes not in audio_fp
    # Humming extraction is best-effort: bytes when it succeeds, else None.
    assert humming_fp is None or isinstance(humming_fp, bytes)
