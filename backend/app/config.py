from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PARAKH_", env_file=".env")

    guest_daily_limit: int = 3
    free_daily_limit: int = 10
    db_url: str = "sqlite:///./parakh.db"
    secret_key: str = "dev-secret"  # signs auth tokens; set PARAKH_SECRET_KEY in prod
    google_client_id: str = ""  # OAuth client id; set PARAKH_GOOGLE_CLIENT_ID in prod
    openrouter_api_key: str = "changeme"
    vision_model: str = "google/gemini-2.5-flash"
    openrouter_url: str = "https://openrouter.ai/api/v1/chat/completions"
    # Embeddings (OpenAI) power semantic "Healthier options" matching.
    openai_api_key: str = ""  # set PARAKH_OPENAI_API_KEY in prod
    embedding_model: str = "text-embedding-3-small"
    embedding_dims: int = 256
    embedding_url: str = "https://api.openai.com/v1/embeddings"
    alt_min_similarity: float = 0.5  # cosine floor for a like-for-like suggestion


def get_settings() -> Settings:
    return Settings()
