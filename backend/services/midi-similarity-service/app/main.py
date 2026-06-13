"""FastAPI entry point for the midi-similarity-service (Echo, Step 2B)."""

from __future__ import annotations

from contextlib import asynccontextmanager

from echo_common.app_factory import create_app
from echo_common.log import configure_logging, get_logger
from fastapi import FastAPI

from .config import settings
from .routes import router
from .service import MidiSimilarityService
from .store import InMemoryRegistryStore, PostgresRegistryStore

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging(settings.log_level)
    if settings.database_url:
        store = await PostgresRegistryStore.connect(settings.database_url)
        logger.info("midi-similarity-service ready (postgres registry)")
    else:
        store = InMemoryRegistryStore()
        logger.warning("ECHO_MIDI_DATABASE_URL not set — using in-memory registry")
    app.state.service = MidiSimilarityService(store, settings)
    try:
        yield
    finally:
        if isinstance(store, PostgresRegistryStore):
            await store.close()


app = create_app(
    title="Echo — midi-similarity-service",
    description="Pipeline Step 2B: compositional similarity vs the private registry.",
    router=router,
    lifespan=lifespan,
)
