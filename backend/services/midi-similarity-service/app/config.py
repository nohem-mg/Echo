"""Service configuration, loaded from the environment (12-factor)."""

from __future__ import annotations

from echo_common.profiles import ProfiledSettings
from pydantic_settings import SettingsConfigDict


class Settings(ProfiledSettings):
    model_config = SettingsConfigDict(env_prefix="ECHO_MIDI_", env_file=("../../.env", ".env"), extra="ignore")

    # Preset bundles — select with ECHO_MIDI_PROFILE; explicit env vars still win.
    PROFILES = {
        # Only report strong candidates.
        "strict": {"similarity_floor": 40.0, "top_n": 5},
        # Surface weak echoes too (report/explainability runs).
        "broad": {"similarity_floor": 5.0, "top_n": 50},
    }

    # registry-service base URL — source of the cached intervals to compare against.
    registry_url: str = "http://127.0.0.1:8004"
    registry_timeout_s: float = 10.0

    # Only return matches at or above this score (the CRE applies the 75 threshold).
    similarity_floor: float = 10.0
    # Cap how many matches we return, highest first.
    top_n: int = 20

    log_level: str = "INFO"


settings = Settings()
