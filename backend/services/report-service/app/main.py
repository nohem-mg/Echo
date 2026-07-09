import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from echo_common.app_factory import create_app
from . import acoustic
from .routes import router
from .config import settings

logging.basicConfig(level=settings.log_level)

@asynccontextmanager
async def lifespan(app: FastAPI):
    log = logging.getLogger(__name__)
    # Pre-load librosa so the first /api/report doesn't pay a >10s cold start
    # (the CRE HTTP call has a tight timeout).
    try:
        acoustic.warmup()
    except Exception:
        log.warning("acoustic warmup failed; first request may be slow", exc_info=True)
    log.info("report-service ready")
    yield

app = create_app(
    title="report-service",
    description="Groq-powered music similarity report generator",
    router=router,
    lifespan=lifespan,
)
