import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from echo_common.app_factory import create_app
from .routes import router
from .config import settings

logging.basicConfig(level=settings.log_level)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.getLogger(__name__).info("report-service ready")
    yield

app = create_app(
    title="report-service",
    description="Groq-powered music similarity report generator",
    router=router,
    lifespan=lifespan,
)
