"""Transport layer: thin routes. Validate input, delegate to the service."""

from __future__ import annotations

from echo_common.log import get_logger
from fastapi import APIRouter, Request

from .schemas import (
    ComparePrivateRequest,
    ComparePrivateResponse,
    RegisterRequest,
    RegisterResponse,
)
from .service import MidiSimilarityService

logger = get_logger(__name__)
# /api prefix matches the contract the CRE calls (POST /api/compare/private).
router = APIRouter(prefix="/api")


def _service(request: Request) -> MidiSimilarityService:
    return request.app.state.service


@router.post("/compare/private", response_model=ComparePrivateResponse, tags=["pipeline"])
async def compare_private(
    request: Request, body: ComparePrivateRequest
) -> ComparePrivateResponse:
    """Step 2B — compositional similarity vs the private registry."""
    matches = await _service(request).compare(body.midi_sequence)
    logger.info(
        "compare/private ok",
        extra={"context": {"request_id": request.state.request_id, "n_matches": len(matches)}},
    )
    return ComparePrivateResponse(
        registry_matches=matches, request_id=request.state.request_id
    )


@router.post("/registry", response_model=RegisterResponse, tags=["registry"])
async def register(request: Request, body: RegisterRequest) -> RegisterResponse:
    """Add a track's melody to the private registry (ingestion path, e.g. on SEAL)."""
    await _service(request).register(body.track_id, body.midi_sequence)
    logger.info(
        "registry add ok",
        extra={"context": {"request_id": request.state.request_id, "track_id": body.track_id}},
    )
    return RegisterResponse(track_id=body.track_id, request_id=request.state.request_id)
