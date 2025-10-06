import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from typing import List

from pydantic import BaseModel, Field, field_validator

load_dotenv()


def _as_bool(value: str | bool | None, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return default


class Settings(BaseModel):
    database_url: str = os.getenv("DATABASE_URL", "postgresql+psycopg://app:app@db:5432/appdb")
    s3_endpoint: str = os.getenv("S3_ENDPOINT", "http://minio:9000")
    s3_access_key: str = os.getenv("S3_ACCESS_KEY", "minio")
    s3_secret_key: str = os.getenv("S3_SECRET_KEY", "minio123")
    s3_bucket: str = os.getenv("S3_BUCKET", "documents")
    opensearch_url: str = os.getenv("OPENSEARCH_URL", "http://opensearch:9200")
    redis_url: str = os.getenv("REDIS_URL", "redis://redis:6379/0")
    nats_url: str = os.getenv("NATS_URL", "nats://nats:4222")
    embed_provider: str = os.getenv("EMBED_PROVIDER", "api")
    embed_model: str = os.getenv("EMBED_MODEL", "text-embedding-3-small")
    chunk_config: Path = Path(os.getenv("CHUNK_CONFIG", "config/chunking.yml"))
    dq_config: Path = Path(os.getenv("DQ_CONFIG", "config/dq_checks.yml"))
    pii_config: Path = Path(os.getenv("PII_CONFIG", "config/pii_policies.yml"))
    embed_config: Path = Path(os.getenv("EMBED_CONFIG", "config/embeddings.yml"))
    enable_ocr: bool = Field(default_factory=lambda: _as_bool(os.getenv("ENABLE_OCR"), True))
    ocr_langs: str = os.getenv("OCR_LANGS", "eng")
    parsers: List[str] = Field(default_factory=lambda: os.getenv("PARSERS", "").split(","))

    @field_validator("parsers", mode="before")
    @classmethod
    def _split_parsers(cls, value: List[str] | str | None) -> List[str]:
        if value is None:
            return []
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return [item.strip() for item in value if item and item.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
