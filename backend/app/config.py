from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="NUTRISCAN_", env_file=".env")

    guest_daily_limit: int = 3
    free_daily_limit: int = 10
    db_url: str = "sqlite:///./nutriscan.db"
    openrouter_api_key: str = "changeme"
    vision_model: str = "google/gemini-flash-1.5"
    openrouter_url: str = "https://openrouter.ai/api/v1/chat/completions"


def get_settings() -> Settings:
    return Settings()
