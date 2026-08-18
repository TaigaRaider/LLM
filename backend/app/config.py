from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="LLM_", env_file=".env", extra="ignore")

    app_name: str = "LLM Backend"
    database_url: str = "sqlite:///./llm.db"
    jwt_secret: str = "dev-secret-change-me"
    jwt_expire_minutes: int = 12 * 60
    cors_origins: list[str] = ["*"]

    default_officer_password: str = "officer123"

    # ---- external participant system integration ----
    external_api_base_url: str = ""
    external_api_token: str = ""
    external_api_participants_path: str = "/participants"
    external_api_delta_path: str = ""
    external_api_field_map: str = '{"id": "id", "name": "name", "id_number": "idNumber", "phone": "phone", "group": "group"}'
    external_sync_enabled: bool = False
    external_sync_interval_seconds: int = 30
    external_sync_timeout_seconds: int = 15

    @property
    def external_field_map(self) -> dict:
        import json

        try:
            return json.loads(self.external_api_field_map)
        except Exception:
            return {}


@lru_cache
def get_settings() -> Settings:
    return Settings()