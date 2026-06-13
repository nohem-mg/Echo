"""Shared MIDI feature extraction.

The skyline melody is the cached feature both sides need: registry-service computes
it once at registration (to store), midi-similarity computes it for the query at
compare time. Keeping it here guarantees both use the exact same extraction.

BasicPitch returns a blended polyphonic note cloud (it does NOT separate instruments),
so we approximate the lead line by keeping the highest pitch at each onset, then take
the intervals between consecutive notes — transposition-invariant.
"""

from __future__ import annotations

from .schemas.midi import MidiSequence

_ONSET_EPS = 0.03  # notes within 30ms share an onset (chord) -> keep the top pitch


def skyline_intervals(seq: MidiSequence) -> list[int]:
    """Extract the melodic line (highest pitch per onset) as an interval sequence."""
    notes = sorted(seq.notes, key=lambda n: (n.start_s, -n.pitch))
    melody: list[int] = []
    last_onset = None
    for n in notes:
        if last_onset is None or n.start_s - last_onset > _ONSET_EPS:
            melody.append(n.pitch)  # new onset -> its highest note (skyline)
            last_onset = n.start_s
    return [melody[i + 1] - melody[i] for i in range(len(melody) - 1)]
