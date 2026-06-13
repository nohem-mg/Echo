"""basic-pitch-service response contract.

The MIDI payload itself lives in echo_common (shared with downstream services);
here we only add the service-specific envelope (model info, request id).
"""

from __future__ import annotations

from echo_common.schemas.midi import MidiSequence
from pydantic import BaseModel, Field


class ModelInfo(BaseModel):
    backend: str = Field(..., description="Resolved inference runtime (coreml/tf/...).")
    version: str = Field(..., description="basic-pitch package version.")


class ConvertResponse(BaseModel):
    midi_sequence: MidiSequence
    model: ModelInfo
    request_id: str
