"""registry-service contracts.

The registry owns the sealed-track records. It is written once per track at SEAL
(by the CRE, verdict CLEAN) and read by midi-similarity-service for comparison.
"""

from __future__ import annotations

from echo_common.schemas.midi import MidiSequence
from pydantic import BaseModel, ConfigDict, Field


class RegisterRequest(BaseModel):
    # Accept "midi_sequence" or the CRE's "midiSequence".
    model_config = ConfigDict(populate_by_name=True)
    track_id: str
    midi_sequence: MidiSequence = Field(alias="midiSequence")
    # Audio fingerprint, stored alongside the track. Optional: the upstream producer
    # (Step 2A / Step 4) may not be wired yet.
    fingerprint: dict | None = None


class RegisterResponse(BaseModel):
    track_id: str
    request_id: str


class TrackIntervals(BaseModel):
    track_id: str
    intervals: list[int]


class IntervalsResponse(BaseModel):
    """The cached features midi-similarity needs to score a query — no MIDI, no fingerprint."""

    tracks: list[TrackIntervals]
