"""Transport layer: thin routes. Validate input, delegate to the service."""

from __future__ import annotations

from echo_common.log import get_logger
from fastapi import APIRouter, Request

from .schemas import (
    IntervalsResponse,
    RegisterRequest,
    RegisterResponse,
)
from .service import RegistryService

logger = get_logger(__name__)
router = APIRouter(prefix="/api")


def _service(request: Request) -> RegistryService:
    return request.app.state.service


@router.post("/registry", response_model=RegisterResponse, tags=["registry"])
async def register(request: Request, body: RegisterRequest) -> RegisterResponse:
    """Persist a sealed track (called by the CRE at SEAL, verdict CLEAN)."""
    await _service(request).register(body.track_id, body.midi_sequence, body.fingerprint)
    logger.info(
        "registry add ok",
        extra={"context": {"request_id": request.state.request_id, "track_id": body.track_id}},
    )
    return RegisterResponse(track_id=body.track_id, request_id=request.state.request_id)


@router.get("/registry/intervals", response_model=IntervalsResponse, tags=["registry"])
async def intervals(request: Request) -> IntervalsResponse:
    """Serve the cached intervals for comparison (consumed by midi-similarity-service)."""
    tracks = await _service(request).list_intervals()
    return IntervalsResponse(tracks=tracks)
