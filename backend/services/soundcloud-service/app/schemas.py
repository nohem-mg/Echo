"""soundcloud-service request/response contract.

POST /api/soundcloud/upload
  Receives an audio file + metadata from the artist's post-SEAL UI and
  publishes the track to SoundCloud using the artist's OAuth2 access_token.
  The token can be supplied per request or configured server-side for the
  one-click post-SEAL publish button.
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

    # SoundCloud OAuth2 access_token. Optional when the service has
    # ECHO_SC_ACCESS_TOKEN configured server-side.
    access_token: str = ""
    refresh_token: str = Field(default="", description="Refresh token for automatic renewal")


class UploadResponse(BaseModel):
    soundcloud_url: str = Field(..., description="Canonical SoundCloud track URL.")
    track_id: int = Field(..., description="SoundCloud numeric track ID.")
    permalink: str = Field(..., description="URL slug of the published track.")
    request_id: str
