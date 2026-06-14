from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    groq_api_key: str
    groq_model: str = "llama-3.3-70b-versatile"
    groq_max_tokens: int = 2048
    log_level: str = "INFO"

    model_config = {"env_prefix": "ECHO_REPORT_"}

settings = Settings()
