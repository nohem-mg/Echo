"""Step 4 request/response contract (CRE + AGENTS.md)."""

from __future__ import annotations

from typing import Literal

from echo_common.schemas.midi import MidiSequence
from pydantic import BaseModel, Field


class RegistryMatchIn(BaseModel):
    track_id: str
    similarity_score: float = Field(..., ge=0, le=100)


class CommercialDeltaIn(BaseModel):
    ISRC: str
    melodic: float = Field(..., ge=0, le=100)
    rhythmic: float = Field(..., ge=0, le=100)
    structural: float = Field(..., ge=0, le=100)


class SubmittedTrack(BaseModel):
    key: str
    mode: str
    BPM: float
    fingerprint: str


class SimilarTrack(BaseModel):
    rank: int
    title: str
    source: Literal["ACRCloud", "Registre privé"]
    score: float
    melody: float
    rhythm: float
    structure: float
    key: str
    BPM: float


class ReportResponse(BaseModel):
    verdict: Literal["CLEAN", "SIMILAR"]
    submitted_track: SubmittedTrack
    similar_tracks: list[SimilarTrack]
    ai_summary: str
    request_id: str
