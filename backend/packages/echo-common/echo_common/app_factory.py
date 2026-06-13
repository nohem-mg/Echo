"""Shared FastAPI app factory.

Wires the cross-cutting concerns every service shares — request_id middleware,
uniform error handlers, and a /health route — so a service only has to provide
its title, router, and (optional) lifespan.
"""

from __future__ import annotations

import uuid
from typing import Any, Callable

from fastapi import APIRouter, FastAPI, Request

from .errors import register_error_handlers

_meta_router = APIRouter()


@_meta_router.get("/health", tags=["meta"])
async def health() -> dict[str, str]:
    return {"status": "ok"}


def create_app(
    *,
    title: str,
    description: str,
    router: APIRouter,
    lifespan: Callable[[FastAPI], Any] | None = None,
    version: str = "0.1.0",
) -> FastAPI:
    app = FastAPI(
        title=title, description=description, version=version, lifespan=lifespan
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
    app.include_router(_meta_router)
    app.include_router(router)
    return app
