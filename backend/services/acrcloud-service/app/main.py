"""FastAPI entry point for the acrcloud-service (Echo, Step 2A)."""

from __future__ import annotations

from contextlib import asynccontextmanager

from echo_common.app_factory import create_app
from echo_common.log import configure_logging, get_logger
from fastapi import FastAPI

from .config import settings
from .routes import router
from .service import AcrCloudService

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging(settings.log_level)
    app.state.service = AcrCloudService(settings)
    if not settings.host:
        logger.warning("ACRCloud credentials not set — /check/public will 502")
    logger.info("acrcloud-service ready")
    yield


app = create_app(
    title="Echo — acrcloud-service",
    description="Pipeline Step 2A: acoustic fingerprint vs ACRCloud public database.",
    router=router,
    lifespan=lifespan,
)
