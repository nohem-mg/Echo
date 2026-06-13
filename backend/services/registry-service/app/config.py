"""Service configuration, loaded from the environment (12-factor)."""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ECHO_REGISTRY_", env_file=".env")

    # Private registry (PostgreSQL). Empty -> in-memory store (dev/tests).
    database_url: str = ""

    log_level: str = "INFO"


settings = Settings()
