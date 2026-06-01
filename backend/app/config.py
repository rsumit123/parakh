from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PARAKH_", env_file=".env")

    guest_daily_limit: int = 3
    free_daily_limit: int = 10
    db_url: str = "sqlite:///./parakh.db"
    secret_key: str = "dev-secret"  # signs auth tokens; set PARAKH_SECRET_KEY in prod
    google_client_id: str = ""  # OAuth client id; set PARAKH_GOOGLE_CLIENT_ID in prod
    openrouter_api_key: str = "changeme"
    vision_model: str = "google/gemini-2.0-flash-001"
    openrouter_url: str = "https://openrouter.ai/api/v1/chat/completions"


def get_settings() -> Settings:
    return Settings()
