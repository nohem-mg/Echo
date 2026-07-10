"""Service configuration, loaded from the environment (12-factor)."""

from __future__ import annotations

from echo_common.profiles import ProfiledSettings
from pydantic_settings import SettingsConfigDict


class Settings(ProfiledSettings):
    model_config = SettingsConfigDict(env_prefix="ECHO_SC_", env_file=("../../.env", ".env"), extra="ignore")

    # Preset bundles — select with ECHO_SC_PROFILE; explicit env vars still win.
    PROFILES = {
        # Quick private demos: small files, fail fast.
        "demo": {"max_upload_bytes": 52_428_800, "timeout_s": 15.0},
        # DJ sets / mixes: large files need a patient upstream call.
        "long_form": {"max_upload_bytes": 524_288_000, "timeout_s": 120.0},
    }

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

    timeout_s: float = 30.0
    log_level: str = "INFO"


settings = Settings()
