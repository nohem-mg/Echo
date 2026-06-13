"""midi-similarity-service contracts (Step 2B).

The CRE reads ``track_id`` + ``similarity_score`` against the SIMILAR threshold (>=75).
The other fields explain *why* (overall reuse vs a distinctive copied phrase).
"""

from __future__ import annotations

from echo_common.schemas.midi import MidiSequence
from pydantic import BaseModel, ConfigDict, Field


class ComparePrivateRequest(BaseModel):
    # Accept "midi_sequence" or the CRE's "midiSequence".
    model_config = ConfigDict(populate_by_name=True)
    midi_sequence: MidiSequence = Field(alias="midiSequence")


class RegistryMatch(BaseModel):
    track_id: str
    similarity_score: float = Field(..., ge=0, le=100)
    # Explainability (ignored by the CRE, used by the report):
    global_overlap: float = Field(..., ge=0, le=100, description="Overall melodic reuse.")
    hook: float = Field(..., ge=0, le=100, description="Distinctive copied-phrase strength.")
    hook_intervals: int = Field(..., ge=0, description="Length of the matched phrase.")


class ComparePrivateResponse(BaseModel):
    registry_matches: list[RegistryMatch]
    request_id: str
