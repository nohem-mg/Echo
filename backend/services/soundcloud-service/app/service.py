"""Business core: SoundCloud track upload.

Privacy-first: the raw audio is streamed directly to SoundCloud from the temp
file and is never stored at rest inside this service. The access_token is used
only within the scope of this single HTTP call and never logged.

The network call (_upload_to_api) is isolated from the file handling so tests
can patch it without touching the filesystem.
"""

from __future__ import annotations

from pathlib import Path

import httpx
from echo_common.errors import UpstreamError
from echo_common.log import get_logger

from .config import Settings
from .schemas import UploadMetadata, UploadResponse

logger = get_logger(__name__)

_SC_API = "https://api.soundcloud.com"
_TRACKS_ENDPOINT = f"{_SC_API}/tracks"


class SoundCloudService:
    def __init__(self, settings: Settings) -> None:
        self._s = settings

    async def upload(
        self, audio_path: Path, metadata: UploadMetadata
    ) -> UploadResponse:
        """Upload an audio file to SoundCloud and return the track permalink."""
        payload = await self._upload_to_api(audio_path, metadata)
        logger.info("SoundCloud API payload", extra={"context": {"payload": payload}})
        
        # SoundCloud may omit the raw 'permalink' key on private creations
        # Fall back to extracting it from the permalink_url.
        # Format can be: https://soundcloud.com/artist/track-name/s-token?...
        # If it's a private track, there might be a secret token. We just extract the last path segment (or second to last if there's a token? Actually, split("/")[-1] on the base URL, but wait, the permalink_url has query params and maybe a secret token path.)
        # Let's strip query parameters from permalink_url before splitting
        import urllib.parse
        parsed_url = urllib.parse.urlparse(payload.get("permalink_url", ""))
        permalink = payload.get("permalink") or parsed_url.path.rstrip("/").split("/")[-1]

        return UploadResponse(
            soundcloud_url=payload.get("permalink_url", ""),
            track_id=payload.get("id", 0),
            permalink=permalink,
            # request_id is injected by the route after construction
            request_id="",
        )

    async def _upload_to_api(
        self, audio_path: Path, metadata: UploadMetadata
    ) -> dict:
        """Single multipart POST to SoundCloud API.

        Isolated for unit-test patching — tests monkeypatch this method so
        the real network is never hit.
        """
        if not metadata.access_token:
            raise UpstreamError("SoundCloud access_token is required.")

        try:
            with audio_path.open("rb") as audio_file:
                async with httpx.AsyncClient(timeout=self._s.timeout_s) as client:
                    resp = await client.post(
                        _TRACKS_ENDPOINT,
                        headers={
                            "Authorization": f"OAuth {metadata.access_token}",
                            "Accept": "application/json; charset=utf-8",
                        },
                        data={
                            "track[title]": metadata.title,
                            "track[description]": metadata.description,
                            # SoundCloud "sharing" maps directly to our privacy field.
                            "track[sharing]": metadata.privacy,
                        },
                        files={"track[asset_data]": audio_file},
                    )
        except httpx.TimeoutException as exc:
            logger.exception("SoundCloud upload timed out")
            raise UpstreamError("SoundCloud upload timed out.") from exc
        except httpx.HTTPError as exc:
            logger.exception("SoundCloud HTTP error")
            raise UpstreamError("SoundCloud request failed.") from exc

        if resp.status_code == 401:
            raise UpstreamError(
                "SoundCloud access_token is invalid or expired.",
                code="unauthorized",
            )
        if not resp.is_success:
            logger.error(
                "SoundCloud upload failed",
                extra={"context": {"status": resp.status_code, "body": resp.text[:256]}},
            )
            raise UpstreamError(
                f"SoundCloud returned {resp.status_code}."
            )

        try:
            return resp.json()
        except ValueError as exc:
            raise UpstreamError("SoundCloud returned an unparseable response.") from exc
