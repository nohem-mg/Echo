"""FastAPI entry point for report-service (Echo, Step 4)."""

from __future__ import annotations

from contextlib import asynccontextmanager

from echo_common.app_factory import create_app
from echo_common.log import configure_logging, get_logger
from fastapi import FastAPI

from .config import settings
from .routes import router
from .acoustic import warmup as warmup_acoustic
from .service import ReportService

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging(settings.log_level)
    warmup_acoustic()
    app.state.service = ReportService(settings)
    logger.info("report-service ready (librosa warmed up)")
    yield


app = create_app(
    title="Echo — report-service",
    description="Pipeline Step 4: acoustic extraction + final ranked report.",
    router=router,
    lifespan=lifespan,
)
