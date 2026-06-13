"""Transport layer — multipart audio + JSON metadata from the dev gateway."""

from __future__ import annotations

import json

from echo_common import audio
from echo_common.schemas.midi import MidiSequence
from echo_common.log import get_logger
from fastapi import APIRouter, File, Form, Request, UploadFile

from .config import settings
from .schemas import CommercialDeltaIn, RegistryMatchIn, ReportResponse
from .service import ReportService

logger = get_logger(__name__)
router = APIRouter(prefix="/api")


def _service(request: Request) -> ReportService:
    return request.app.state.service


def _parse_json_list(raw: str, model):
    try:
        data = json.loads(raw or "[]")
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid JSON: {exc}") from exc
    if not isinstance(data, list):
        raise ValueError("expected JSON array")
    return [model.model_validate(item) for item in data]


@router.post("/report", response_model=ReportResponse, tags=["pipeline"])
async def report(
    request: Request,
    file: UploadFile = File(...),
    registry_matches: str = Form("[]"),
    commercial_deltas: str = Form("[]"),
    midiSequence: str = Form("{}"),
) -> ReportResponse:
    """Step 4 — key/BPM/fingerprint from raw audio + ranked similar tracks."""
    ext = audio.validate_extension(file, settings.allowed_extensions)
    registry = _parse_json_list(registry_matches, RegistryMatchIn)
    commercial = _parse_json_list(commercial_deltas, CommercialDeltaIn)
    midi = MidiSequence.model_validate(json.loads(midiSequence or "{}"))

    with audio.persist_upload(file, ext, settings.max_upload_bytes) as path:
        body = _service(request).build_report(
            path,
            midi_sequence=midi,
            registry_matches=registry,
            commercial_deltas=commercial,
            request_id=request.state.request_id,
        )

    logger.info(
        "report ok",
        extra={
            "context": {
                "request_id": request.state.request_id,
                "verdict": body.verdict,
                "n_similar": len(body.similar_tracks),
            }
        },
    )
    return body
