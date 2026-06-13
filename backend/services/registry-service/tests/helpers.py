"""Test helpers."""

from __future__ import annotations

from echo_common.schemas.midi import MidiSequence, NoteEvent


def midi_from_pitches(pitches: list[int], step: float = 0.5) -> MidiSequence:
    """Build a simple monophonic MidiSequence from a list of MIDI pitches."""
    notes = [
        NoteEvent(start_s=i * step, end_s=i * step + 0.4, pitch=p, velocity=80)
        for i, p in enumerate(pitches)
    ]
    duration = notes[-1].end_s if notes else 0.0
    return MidiSequence(notes=notes, duration_s=duration, n_notes=len(notes))
