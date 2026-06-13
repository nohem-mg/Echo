"""Algorithm tests — pure, no I/O. Encodes the lessons from the case-law reference."""

from __future__ import annotations

from app.similarity import score_intervals, skyline_intervals
from tests.helpers import midi_from_pitches


# A distinctive, varied melody (non-trivial intervals).
DISTINCTIVE = [60, 67, 65, 72, 64, 71, 62, 69, 60, 68]


def _intervals(pitches: list[int]) -> list[int]:
    return skyline_intervals(midi_from_pitches(pitches))


def test_identical_is_max():
    a = _intervals(DISTINCTIVE)
    assert score_intervals(a, a).similarity == 100.0


def test_transposition_invariant():
    # Same melody a perfect fifth up -> intervals unchanged -> still identical.
    a = _intervals(DISTINCTIVE)
    b = _intervals([p + 7 for p in DISTINCTIVE])
    assert score_intervals(a, b).similarity == 100.0


def test_distinctive_hook_embedded_in_different_song():
    # B is a different (commonplace) intro followed by A's distinctive motif.
    a = _intervals(DISTINCTIVE)
    b = _intervals([40, 41, 42, 43, 44] + DISTINCTIVE)
    s = score_intervals(a, b)
    assert s.hook > 0 and s.hook_intervals >= 5
    assert s.similarity >= 75  # the copied hook alone should flag


def test_copied_scale_does_not_flag():
    # A pure C-major scale copied verbatim is commonplace -> must score ~0.
    scale = _intervals([60, 62, 64, 65, 67, 69, 71, 72])
    s = score_intervals(scale, scale)
    assert s.similarity == 0.0


def test_short_coincidence_does_not_flag():
    # Only 3 notes (2 intervals) in common -> below the hook gate -> not flagged.
    a = _intervals([60, 64, 67, 80, 50, 90, 55])
    b = _intervals([60, 64, 67, 30, 95, 40, 85])
    assert score_intervals(a, b).similarity < 75


def test_unrelated_melodies_low():
    a = _intervals(DISTINCTIVE)
    b = _intervals([61, 58, 73, 55, 74, 59, 70, 56])
    assert score_intervals(a, b).similarity < 75
