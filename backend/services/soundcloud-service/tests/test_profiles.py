"""SoundCloud preset bundles resolve to valid settings."""

from __future__ import annotations

from app.config import Settings


def test_demo_profile():
    s = Settings(profile="demo", _env_file=None)
    assert s.max_upload_bytes == 52_428_800
    assert s.timeout_s == 15.0


def test_long_form_profile():
    s = Settings(profile="long_form", _env_file=None)
    assert s.max_upload_bytes == 524_288_000
    assert s.timeout_s == 120.0
