"""Service configuration, loaded from the environment (12-factor)."""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ECHO_ACR_", env_file=".env")

    # --- ACRCloud credentials (from the ACRCloud console) ---
    host: str = ""
    access_key: str = ""
    access_secret: str = ""
    timeout_s: float = 10.0
    # Seconds of audio fingerprinted and sent (the rest never leaves the service).
    # 20s gives margin against quiet intros without diminishing-returns latency.
    sample_seconds: int = 20
    # Also send a humming fingerprint to surface melodic/cover matches (needs the
    # Humming bucket enabled on the ACRCloud project; harmless if it isn't).
    enable_cover: bool = True

    # --- Audio input bounds (validated BEFORE the upstream call) ---
    allowed_extensions: tuple[str, ...] = ("wav", "mp3", "flac", "ogg", "m4a")
    max_upload_bytes: int = 50 * 1024 * 1024  # 50 MB

    log_level: str = "INFO"


settings = Settings()
