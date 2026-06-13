"""FastAPI entry point for the registry-service (Echo private registry)."""

from __future__ import annotations

from contextlib import asynccontextmanager

from echo_common.app_factory import create_app
from echo_common.log import configure_logging, get_logger
from fastapi import FastAPI

from .config import settings
from .routes import router
from .service import RegistryService
from .store import InMemoryRegistryStore, PostgresRegistryStore

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging(settings.log_level)
    if settings.database_url:
        store = await PostgresRegistryStore.connect(settings.database_url)
        logger.info("registry-service ready (postgres)")
    else:
        store = InMemoryRegistryStore()
        logger.warning("ECHO_REGISTRY_DATABASE_URL not set — using in-memory registry")
    app.state.service = RegistryService(store)
    try:
        yield
    finally:
        if isinstance(store, PostgresRegistryStore):
            await store.close()


app = create_app(
    title="Echo — registry-service",
    description="Private registry of sealed tracks: write at SEAL, read for comparison.",
    router=router,
    lifespan=lifespan,
)
