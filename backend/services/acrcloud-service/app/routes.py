"""Transport layer: thin routes. Validate input, delegate to the service."""

from __future__ import annotations

from echo_common import audio
from echo_common.log import get_logger
from fastapi import APIRouter, File, Request, UploadFile

from .config import settings
from .schemas import CheckPublicResponse
from .service import AcrCloudService

# /api prefix matches the contract the CRE calls (POST /api/check/public).
logger = get_logger(__name__)
router = APIRouter(prefix="/api")


def _service(request: Request) -> AcrCloudService:
    return request.app.state.service


@router.post("/check/public", response_model=CheckPublicResponse, tags=["pipeline"])
async def check_public(
    request: Request, file: UploadFile = File(...)
) -> CheckPublicResponse:
    """Step 2A — acoustic fingerprint vs ACRCloud's public database.

    multipart/form-data, `file` field. Returns ISRC + confidence per match.
    """
    ext = audio.validate_extension(file, settings.allowed_extensions)

    with audio.persist_upload(file, ext, settings.max_upload_bytes) as path:
        matches, cover_matches = await _service(request).check_public(path)

    logger.info(
        "check/public ok",
        extra={
            "context": {
                "request_id": request.state.request_id,
                "n_matches": len(matches),
                "n_cover_matches": len(cover_matches),
            }
        },
    )
    return CheckPublicResponse(
        matches=matches,
        cover_matches=cover_matches,
        request_id=request.state.request_id,
    )
