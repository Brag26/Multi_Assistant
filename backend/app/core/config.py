from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    app_name: str = "AI Voice Operations Platform"
    environment: str = "local"
    database_url: str
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"
    supabase_url: str = ""
    supabase_jwks_url: str = ""
    supabase_jwt_audience: str = "authenticated"
    supabase_service_role_key: str = ""
    cors_origins: str = "http://localhost:3000"
    vapi_api_key: str = ""
    vapi_base_url: str = "https://api.vapi.ai"
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_webhook_secret: str = ""
    make_webhook_signing_secret: str = ""
    google_client_id: str = ""
    google_client_secret: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]

settings = get_settings()
