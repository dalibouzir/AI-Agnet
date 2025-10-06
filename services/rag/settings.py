"""Configuration helpers for the RAG service."""

from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv
from pydantic import BaseModel, Field

load_dotenv()


class Settings(BaseModel):
    app_name: str = Field(default="RAG Service")
    opensearch_url: str = Field(default="http://opensearch:9200")
    rag_index: str = Field(default="rag-chunks")
    llm_url: str = Field(default="http://llm:8000")
    minio_endpoint: str = Field(default="http://minio:9000")
    minio_access_key: str = Field(default="minio")
    minio_secret_key: str = Field(default="minio123")
    request_timeout_s: float = Field(default=15.0, gt=0)
    embedding_dimension: int = Field(default=1536, gt=0)
    llm_timeout_s: float = Field(default=20.0, gt=0)
    embedding_batch_size: int = Field(default=64, gt=0)
    bulk_batch_size: int = Field(default=500, gt=0)


def _coerce_float(env_name: str, default: float) -> float:
    raw = os.getenv(env_name)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError as exc:  # pragma: no cover - defensive guard
        raise RuntimeError(f"Invalid float for {env_name}: {raw}") from exc


def _coerce_int(env_name: str, default: int) -> int:
    raw = os.getenv(env_name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError as exc:  # pragma: no cover - defensive guard
        raise RuntimeError(f"Invalid integer for {env_name}: {raw}") from exc


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        opensearch_url=os.getenv("OPENSEARCH_URL", "http://opensearch:9200"),
        rag_index=os.getenv("RAG_INDEX", "rag-chunks"),
        llm_url=os.getenv("LLM_URL", "http://llm:8000"),
        minio_endpoint=os.getenv("MINIO_ENDPOINT", "http://minio:9000"),
        minio_access_key=os.getenv("MINIO_ACCESS_KEY", "minio"),
        minio_secret_key=os.getenv("MINIO_SECRET_KEY", "minio123"),
        request_timeout_s=_coerce_float("REQUEST_TIMEOUT_S", 15.0),
        embedding_dimension=_coerce_int("EMBEDDING_DIMENSION", 1536),
        llm_timeout_s=_coerce_float("LLM_TIMEOUT_S", 20.0),
        embedding_batch_size=_coerce_int("EMBEDDING_BATCH_SIZE", 64),
        bulk_batch_size=_coerce_int("BULK_BATCH_SIZE", 500),
    )
