from functools import lru_cache
from typing import Any

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "AI Log Analyzer (SecOps Assistant)"
    app_env: str = "development"
    max_upload_size_bytes: int = 10 * 1024 * 1024
    allowed_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])
    ollama_url: str = "http://localhost:11434"
    ollama_base_url: str | None = None
    ollama_model: str = "mistral"
    ollama_timeout_seconds: float = 240.0

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
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
        return data


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
