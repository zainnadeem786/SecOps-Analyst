from functools import lru_cache
from typing import Any

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "AI Log Analyzer (SecOps Assistant)"
    app_env: str = "development"
    max_upload_size_bytes: int = 10 * 1024 * 1024
    allowed_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/secops_analyst"
    jwt_secret_key: str = "change-this-development-secret-key-32"
    auth_cookie_name: str = "secops_access_token"
    auth_token_ttl_hours: int = 12
    guest_analysis_limit: int = 3
    share_link_ttl_hours: int = 7 * 24
    alert_risk_threshold: int = 85
    alert_webhook_url: str | None = None
    alert_webhook_timeout_seconds: float = 5.0
    alert_email_enabled: bool = False
    alert_email_from: str | None = None
    alert_email_to: str | None = None
    alert_smtp_host: str | None = None
    alert_smtp_port: int = 587
    alert_smtp_username: str | None = None
    alert_smtp_password: str | None = None
    alert_smtp_use_tls: bool = True
    ollama_url: str = "http://localhost:11434"
    ollama_base_url: str | None = None
    ollama_model: str = "mistral"
    ollama_timeout_seconds: float = 240.0
    geoip_enabled: bool = True
    geoip_provider_url: str = "http://ip-api.com/json"
    geoip_timeout_seconds: float = 5.0
    geoip_cache_ttl_seconds: int = 60 * 60 * 24
    rules_file_path: str = "app/config/rules.json"
    websocket_flush_line_count: int = 25
    websocket_flush_interval_seconds: float = 2.0

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        env_ignore_empty=True,
        extra="ignore",
    )

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def split_allowed_origins(cls, value: Any) -> list[str]:
        if value is None:
            return ["http://localhost:3000"]
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        if isinstance(value, list):
            return value
        raise ValueError("allowed_origins must be a list or a comma-separated string.")

    @model_validator(mode="before")
    @classmethod
    def apply_ollama_url_fallback(cls, data: Any) -> Any:
        if isinstance(data, dict):
            ollama_url = data.get("ollama_url")
            legacy_url = data.get("ollama_base_url")
            if not ollama_url and legacy_url:
                data["ollama_url"] = legacy_url
            database_url = data.get("database_url")
            if isinstance(database_url, str):
                if database_url.startswith("postgresql://") and "+psycopg" not in database_url:
                    data["database_url"] = database_url.replace("postgresql://", "postgresql+psycopg://", 1)
                elif database_url.startswith("postgres://"):
                    data["database_url"] = database_url.replace("postgres://", "postgresql+psycopg://", 1)
        return data

    @property
    def auth_cookie_secure(self) -> bool:
        return self.app_env.lower() not in {"development", "dev", "local"}


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
