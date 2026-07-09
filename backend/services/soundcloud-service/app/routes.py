"""Transport layer: thin route. Validate input, delegate to the service."""

from __future__ import annotations

import json

from echo_common import audio
from echo_common.errors import InvalidAudioError
from echo_common.log import get_logger
from fastapi import APIRouter, File, Form, Request, UploadFile

from .config import settings
from .schemas import UploadMetadata, UploadResponse
from .service import SoundCloudService

logger = get_logger(__name__)
router = APIRouter(prefix="/api")


def _service(request: Request) -> SoundCloudService:
    return request.app.state.service


@router.post("/soundcloud/upload", response_model=UploadResponse, tags=["pipeline"])
async def soundcloud_upload(
    request: Request,
    file: UploadFile = File(...),
    metadata: str = Form(...),
) -> UploadResponse:
    """Post-SEAL — publish the artist's track to SoundCloud.

    multipart/form-data:
      - ``file``: audio file (WAV, MP3, FLAC, OGG, AIFF, M4A).
      - ``metadata``: JSON string matching ``UploadMetadata``.

    Returns the SoundCloud track URL and permalink on success.
    """
    try:
        meta = UploadMetadata.model_validate(json.loads(metadata))
    except (json.JSONDecodeError, ValueError) as exc:
        raise InvalidAudioError(
            f"Invalid metadata JSON: {exc}", code="validation_error"
        ) from exc

    ext = audio.validate_extension(file, settings.allowed_extensions)

    with audio.persist_upload(file, ext, settings.max_upload_bytes) as path:
        result = await _service(request).upload(path, meta)

    result.request_id = request.state.request_id

    logger.info(
        "soundcloud/upload ok",
        extra={
            "context": {
                "request_id": request.state.request_id,
                "track_id": result.track_id,
                "permalink": result.permalink,
            }
        },
    )
    return result
