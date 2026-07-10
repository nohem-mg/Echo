from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    groq_api_key: str | None = None
    groq_model: str = "llama-3.3-70b-versatile"
    groq_max_tokens: int = 2048
    log_level: str = "INFO"
    # Seconds of raw audio decoded for key/BPM/fingerprint extraction (Step 4).
    max_audio_seconds: float = 60.0

    model_config = SettingsConfigDict(env_prefix="ECHO_REPORT_", env_file=("../../.env", ".env"), extra="ignore")

settings = Settings()
