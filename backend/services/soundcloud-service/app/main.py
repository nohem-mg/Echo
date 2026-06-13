"""FastAPI entry point for the soundcloud-service (Echo, post-SEAL publish)."""

from __future__ import annotations

from contextlib import asynccontextmanager

from echo_common.app_factory import create_app
from echo_common.log import configure_logging, get_logger
from fastapi import FastAPI

from .config import settings
from .routes import router
from .service import SoundCloudService

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging(settings.log_level)
    app.state.service = SoundCloudService(settings)
    if not settings.client_id:
        logger.warning(
            "SoundCloud client_id not set — /api/soundcloud/upload will rely "
            "solely on the artist's access_token for authorization."
        )
    logger.info("soundcloud-service ready")
    yield


app = create_app(
    title="Echo — soundcloud-service",
    description="Post-SEAL: publish a registered track to SoundCloud.",
    router=router,
    lifespan=lifespan,
)
