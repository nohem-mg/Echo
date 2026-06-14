"""Service configuration, loaded from the environment (12-factor)."""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ECHO_SC_", env_file=".env")

    # --- SoundCloud app credentials (from https://soundcloud.com/you/apps) ---
    # Used only to refresh a supplied or configured user token.
    client_id: str = ""
    client_secret: str = ""

    # Optional server-side token pair for the post-SEAL publish button. Request
    # metadata can still override these values per upload.
    access_token: str = ""
    refresh_token: str = ""

    # --- Upload bounds (validated BEFORE the upstream call) ---
    allowed_extensions: tuple[str, ...] = ("wav", "mp3", "flac", "ogg", "aiff", "m4a")
    max_upload_bytes: int = 314_572_800  # 300 MB

    # --- HTTP client ---
    timeout_s: float = 30.0

    # --- Observability ---
    log_level: str = "INFO"


settings = Settings()
