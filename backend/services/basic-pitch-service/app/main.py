"""FastAPI entry point for the basic-pitch-service (Echo, Step 1)."""

from __future__ import annotations

from contextlib import asynccontextmanager

from echo_common.app_factory import create_app
from echo_common.log import configure_logging, get_logger
from fastapi import FastAPI

from .config import settings
from .routes import router
from .service import BasicPitchService

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging(settings.log_level)
    service = BasicPitchService(settings)
    service.warmup()  # load the model once, not per request
    app.state.service = service
    logger.info("basic-pitch-service ready")
    yield


app = create_app(
    title="Echo — basic-pitch-service",
    description="Pipeline Step 1: raw audio -> MIDI conversion.",
    router=router,
    lifespan=lifespan,
)
