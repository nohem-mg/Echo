"""Service configuration, loaded from the environment (12-factor)."""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ECHO_BP_", env_file=".env")

    # --- Audio input bounds (validated BEFORE any inference) ---
    # Formats accepted by librosa; WAV recommended (lossless -> better transcription).
    allowed_extensions: tuple[str, ...] = ("wav", "mp3", "flac", "ogg", "m4a")
    max_upload_bytes: int = 50 * 1024 * 1024  # 50 MB
    max_duration_s: float = 600.0  # 10 min

    # --- BasicPitch inference params (Step 1: we convert, we do not analyze) ---
    onset_threshold: float = 0.5
    frame_threshold: float = 0.3
    minimum_note_length_ms: float = 127.7
    minimum_frequency: float | None = None
    maximum_frequency: float | None = None

    log_level: str = "INFO"


settings = Settings()
