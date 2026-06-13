"""Transport layer: thin routes. Validate input, delegate to the service."""

from __future__ import annotations

from fastapi import APIRouter, File, Request, UploadFile

from .config import settings
from .core import audio
from .core.log import get_logger
from .schemas.midi import ConvertResponse
from .service import BasicPitchService

logger = get_logger(__name__)
router = APIRouter()


def _service(request: Request) -> BasicPitchService:
    return request.app.state.service


@router.get("/health", tags=["meta"])
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/convert", response_model=ConvertResponse, tags=["pipeline"])
async def convert(request: Request, file: UploadFile = File(...)) -> ConvertResponse:
    """Step 1 — raw audio -> MIDI. Conversion only, no analysis.

    multipart/form-data, `file` field. WAV recommended (lossless).
    """
    ext = audio.validate_extension(file, settings.allowed_extensions)

    with audio.persist_upload(file, ext, settings.max_upload_bytes) as path:
        duration = audio.enforce_duration(path, settings.max_duration_s)
        midi_sequence, model_info = _service(request).convert(path)

    logger.info(
        "convert ok",
        extra={
            "context": {
                "request_id": request.state.request_id,
                "duration_s": round(duration, 2),
                "n_notes": midi_sequence.n_notes,
            }
        },
    )
    return ConvertResponse(
        midi_sequence=midi_sequence,
        model=model_info,
        request_id=request.state.request_id,
    )
