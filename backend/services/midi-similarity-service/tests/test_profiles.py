"""Profile presets: bundle applies, explicit values still win, bad names rejected."""

from __future__ import annotations

import pytest

from app.config import Settings


def test_profile_applies_bundle():
    s = Settings(profile="strict", _env_file=None)
    assert s.similarity_floor == 40.0
    assert s.top_n == 5


def test_explicit_value_beats_profile():
    s = Settings(profile="strict", similarity_floor=99.0, _env_file=None)
    assert s.similarity_floor == 99.0
    assert s.top_n == 5  # rest of the bundle still applies


def test_env_var_beats_profile(monkeypatch):
    monkeypatch.setenv("ECHO_MIDI_PROFILE", "broad")
    monkeypatch.setenv("ECHO_MIDI_TOP_N", "7")
    s = Settings(_env_file=None)
    assert s.similarity_floor == 5.0  # from the profile
    assert s.top_n == 7  # env override wins over the profile's 50


def test_unknown_profile_lists_options():
    with pytest.raises(Exception, match="broad.*strict|strict.*broad"):
        Settings(profile="nope", _env_file=None)


def test_all_preset_fields_exist():
    for name, preset in Settings.PROFILES.items():
        for field in preset:
            assert field in Settings.model_fields, f"{name} sets unknown field {field}"
