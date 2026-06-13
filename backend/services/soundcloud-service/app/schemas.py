"""soundcloud-service request/response contract.

POST /api/soundcloud/upload
  Receives an audio file + metadata from the artist's post-SEAL UI and
  publishes the track to SoundCloud using the artist's OAuth2 access_token.
  The access_token is obtained by the frontend (Cyriac) after the SoundCloud
  OAuth2 Authorization Code flow — the service never holds it at rest.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class UploadMetadata(BaseModel):
    """JSON metadata sent alongside the audio file in the multipart upload."""

    title: str = Field(..., min_length=1, max_length=255)
    description: str = Field(default="", max_length=10_000)
    # SoundCloud uses "sharing" terminology: "public" | "private".
    privacy: Literal["public", "private"] = "private"

    # SoundCloud OAuth2 access_token — obtained by the frontend OAuth flow.
    # NOTE: The gateway sees this token in transit. Acceptable for hackathon;
    # in production, store the token server-side after the OAuth callback
    # and reference it by session ID instead of passing it in the request body.
    access_token: str = Field(..., min_length=1)


class UploadResponse(BaseModel):
    soundcloud_url: str = Field(..., description="Canonical SoundCloud track URL.")
    track_id: int = Field(..., description="SoundCloud numeric track ID.")
    permalink: str = Field(..., description="URL slug of the published track.")
    request_id: str
