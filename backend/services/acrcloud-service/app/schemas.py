"""acrcloud-service response contract (Step 2A).

The CRE reads ``confidence_score`` against the fail-fast thresholds:
>=95 -> REJECTED (plagiarism), 50-94 -> Step 3, <50 -> Step 3 skipped.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class PublicMatch(BaseModel):
    # ISRC + confidence_score are the fields the CRE reads against the thresholds;
    # the rest is extra context, useful for the final report (Step 4).
    ISRC: str | None = Field(
        default=None, description="ISRC of the matched recording, if known."
    )
    confidence_score: float = Field(
        ..., ge=0, le=100, description="ACRCloud match score (0-100)."
    )
    title: str | None = None
    artists: list[str] = Field(default_factory=list)
    album: str | None = None
    label: str | None = None
    release_date: str | None = None
    duration_ms: int | None = None


class CheckPublicResponse(BaseModel):
    # Exact acoustic matches (same master). ISRC + confidence_score drive the CRE
    # thresholds (>=95 REJECTED, 50-94 Step 3, <50 ignored).
    matches: list[PublicMatch]
    # Melodic/cover matches (same composition, different recording). Candidates for
    # the compositional comparison in Step 3; empty unless the Humming bucket is on.
    cover_matches: list[PublicMatch] = Field(default_factory=list)
    request_id: str
