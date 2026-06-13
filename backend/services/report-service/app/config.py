"""Service configuration (12-factor)."""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ECHO_REPORT_", env_file=".env")

    allowed_extensions: tuple[str, ...] = ("wav", "mp3", "flac", "ogg", "m4a")
    max_upload_bytes: int = 50 * 1024 * 1024
    max_analysis_seconds: float = 30.0
    similar_threshold: float = 75.0
    log_level: str = "INFO"


settings = Settings()
