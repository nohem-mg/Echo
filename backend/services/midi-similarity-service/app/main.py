"""FastAPI entry point for the midi-similarity-service (Echo, Step 2B)."""

from __future__ import annotations

from contextlib import asynccontextmanager

from echo_common.app_factory import create_app
from echo_common.log import configure_logging, get_logger
from fastapi import FastAPI

from .config import settings
from .registry_client import RegistryClient
from .routes import router
from .service import MidiSimilarityService

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging(settings.log_level)
    registry = RegistryClient(settings.registry_url, settings.registry_timeout_s)
    app.state.service = MidiSimilarityService(registry.all_intervals, settings)
    logger.info("midi-similarity-service ready (registry=%s)", settings.registry_url)
    yield


app = create_app(
    title="Echo — midi-similarity-service",
    description="Pipeline Step 2B: compositional similarity vs the private registry.",
    router=router,
    lifespan=lifespan,
)
