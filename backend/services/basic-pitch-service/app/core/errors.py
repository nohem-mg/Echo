"""Domain errors + handlers producing a uniform error envelope.

The machine-readable ``code`` is stable: the CRE uses it to decide fail-fast,
it never parses the human message.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel


class ErrorResponse(BaseModel):
    code: str
    message: str
    request_id: str | None = None
    details: Any | None = None


class DomainError(Exception):
    status_code: int = 500
    code: str = "internal_error"

    def __init__(self, message: str, *, code: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        if code is not None:
            self.code = code


class UnsupportedMediaError(DomainError):
    status_code = 415
    code = "unsupported_media_type"


class PayloadTooLargeError(DomainError):
    status_code = 413
    code = "payload_too_large"


class InvalidAudioError(DomainError):
    """Unreadable, corrupt, or out-of-bounds (duration) audio."""

    status_code = 422
    code = "invalid_audio"


class InferenceError(DomainError):
    """Model inference failure — the CRE treats this as STOP fail-fast."""

    status_code = 500
    code = "inference_error"


def _request_id(request: Request) -> str | None:
    return getattr(request.state, "request_id", None)


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def _domain(request: Request, exc: DomainError) -> JSONResponse:
        body = ErrorResponse(
            code=exc.code, message=exc.message, request_id=_request_id(request)
        )
        return JSONResponse(status_code=exc.status_code, content=body.model_dump())

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        body = ErrorResponse(
            code="validation_error",
            message="Invalid request.",
            details=exc.errors(),
            request_id=_request_id(request),
        )
        return JSONResponse(status_code=422, content=body.model_dump())

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        body = ErrorResponse(
            code="internal_error",
            message="Internal error.",
            request_id=_request_id(request),
        )
        return JSONResponse(status_code=500, content=body.model_dump())
