"""FastAPI entry point for the basic-pitch-service (Echo, Step 1)."""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request

from .config import settings
from .core.errors import register_error_handlers
from .core.log import configure_logging, get_logger
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


def create_app() -> FastAPI:
    app = FastAPI(
        title="Echo — basic-pitch-service",
        description="Pipeline Step 1: raw audio -> MIDI conversion.",
        version="0.1.0",
        lifespan=lifespan,
    )

    @app.middleware("http")
    async def attach_request_id(request: Request, call_next):
        request.state.request_id = request.headers.get(
            "x-request-id", str(uuid.uuid4())
        )
        response = await call_next(request)
        response.headers["x-request-id"] = request.state.request_id
        return response

    register_error_handlers(app)
    app.include_router(router)
    return app


app = create_app()
