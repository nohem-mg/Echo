"""Shared MIDI contract.

Produced by basic-pitch-service (Step 1), consumed by midi-similarity-service
(Step 2B). Lives here so both sides import the exact same Pydantic types and the
schema can never drift between producer and consumer.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class NoteEvent(BaseModel):
    """A transcribed note. Times in seconds, pitch as a MIDI number (0-127)."""

    start_s: float = Field(..., ge=0, description="Note onset in seconds.")
    end_s: float = Field(..., ge=0, description="Note offset in seconds.")
    pitch: int = Field(..., ge=0, le=127, description="MIDI pitch (60 = C4).")
    velocity: int = Field(
        ..., ge=0, le=127, description="Velocity derived from BasicPitch amplitude."
    )
    pitch_bends: list[float] | None = Field(
        default=None, description="Pitch-bend curve if detected, else null."
    )


class MidiSequence(BaseModel):
    """Full MIDI sequence from the conversion. No analysis here."""

    notes: list[NoteEvent]
    duration_s: float = Field(..., ge=0, description="Span covered by the notes.")
    n_notes: int = Field(..., ge=0)
    # BasicPitch CONVERTS, it does not analyze: tempo/key stay out of Step 1.
    tempo_bpm_estimate: None = Field(
        default=None,
        description="Always null in Step 1; key/BPM come from raw audio (Step 4).",
    )
