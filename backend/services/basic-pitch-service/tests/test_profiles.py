"""BasicPitch preset bundles resolve to valid settings."""

from __future__ import annotations

from app.config import Settings


def test_sensitive_profile():
    s = Settings(profile="sensitive", _env_file=None)
    assert s.onset_threshold == 0.3
    assert s.frame_threshold == 0.2
    assert s.minimum_note_length_ms == 60.0


def test_strict_profile_keeps_unrelated_defaults():
    s = Settings(profile="strict", _env_file=None)
    assert s.onset_threshold == 0.7
    assert s.max_duration_s == 600.0  # untouched by the bundle
