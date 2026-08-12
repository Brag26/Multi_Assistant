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
    # Set this to the same value as the "secret" field on your Vapi
    # assistant/org server URL config. Vapi sends it back as the
    # `x-vapi-secret` header on every webhook call so we can verify the
    # request actually came from Vapi. Left blank, verification is skipped
    # (with a loud warning) — the endpoint is unauthenticated in that case.
    vapi_webhook_secret: str = ""
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_webhook_secret: str = ""
    make_webhook_signing_secret: str = ""
    google_client_id: str = ""
    google_client_secret: str = ""

    # ── Billing ──────────────────────────────────────────────────────────
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_currency: str = "usd"
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_webhook_secret: str = ""
    frontend_url: str = "http://localhost:3000"

    # Make.com scenario webhook URLs — one per email type. Leave blank to skip.
    make_welcome_email_webhook: str = ""
    make_approval_email_webhook: str = ""
    make_usage_warning_webhook: str = ""
    make_invoice_email_webhook: str = ""
    make_support_escalation_webhook: str = ""
    autopilot_cron_secret: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]

settings = get_settings()
