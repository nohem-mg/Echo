"""Service configuration, loaded from the environment (12-factor)."""

from __future__ import annotations

from echo_common.profiles import ProfiledSettings
from pydantic_settings import SettingsConfigDict


class Settings(ProfiledSettings):
    model_config = SettingsConfigDict(env_prefix="ECHO_BP_", env_file=("../../.env", ".env"), extra="ignore")

    # Preset bundles — select with ECHO_BP_PROFILE; explicit env vars still win.
    PROFILES = {
        # Quiet or dense material: catch short/soft notes, at the cost of noise.
        "sensitive": {"onset_threshold": 0.3, "frame_threshold": 0.2, "minimum_note_length_ms": 60.0},
        # Clean melodic lines: suppress phantom notes.
        "strict": {"onset_threshold": 0.7, "frame_threshold": 0.5, "minimum_note_length_ms": 150.0},
    }

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
