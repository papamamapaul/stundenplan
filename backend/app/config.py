from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    jwt_secret: str = Field('change-me', env='STUNDENPLAN_JWT_SECRET')
    jwt_algorithm: str = 'HS256'
    access_token_expire_minutes: int = 60
    refresh_token_expire_minutes: int = 60 * 24 * 7
    default_admin_email: str = Field('admin@example.com', env='STUNDENPLAN_ADMIN_EMAIL')
    default_admin_password: str = Field('admin', env='STUNDENPLAN_ADMIN_PASSWORD')

    class Config:
        env_prefix = 'STUNDENPLAN_'
        case_sensitive = False


settings = Settings()
