"""Configuration management for Floww."""

import secrets
from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env.local", ".env"),
        env_file_encoding="utf-8",
        env_prefix="FLOWW_",
        extra="ignore",
    )

    # General
    debug: bool = False
    disable_auth: bool = False  # Disable auth for development
    
    # Database
    database_url: str = "sqlite:///floww.db"
    storage_path: str = "./storage"
    log_level: str = "INFO"
    
    # LLM Providers
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    google_api_key: Optional[str] = None
    llm_provider: str = "openai"
    
    # Security
    redis_url: Optional[str] = None
    secret_key: str = secrets.token_urlsafe(32)
    encryption_key: Optional[str] = None
    
    # API Settings
    cors_origins: list[str] = ["*"]
    api_rate_limit: int = 100  # requests per minute
    
    @property
    def has_openai(self) -> bool:
        return bool(self.openai_api_key)

    @property
    def has_anthropic(self) -> bool:
        return bool(self.anthropic_api_key)

    @property
    def has_google(self) -> bool:
        return bool(self.google_api_key)

    @property
    def available_providers(self) -> list[str]:
        providers = []
        if self.has_openai:
            providers.append("openai")
        if self.has_anthropic:
            providers.append("anthropic")
        if self.has_google:
            providers.append("google")
        return providers

    def validate_llm_config(self) -> None:
        if not self.available_providers:
            raise ValueError(
                "At least one LLM API key must be configured. "
                "Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_API_KEY in your environment."
            )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
