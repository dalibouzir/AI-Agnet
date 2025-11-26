"""Configuration helpers for the RAG service."""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Optional

from dotenv import load_dotenv
from pydantic import BaseModel, Field

load_dotenv()


class Settings(BaseModel):
    app_name: str = Field(default="RAG Service")
    opensearch_url: str = Field(default="http://opensearch:9200")
    rag_index: str = Field(default="rag-chunks")
    index_sp500: str = Field(default="index_sp500")
    index_phrasebank: str = Field(default="index_phrasebank")
    llm_url: str = Field(default="http://llm-api:8000")
    minio_endpoint: str = Field(default="http://minio:9000")
    minio_access_key: str = Field(default="minio")
    minio_secret_key: str = Field(default="minio123")
    request_timeout_s: float = Field(default=15.0, gt=0)
    embedding_dimension: int = Field(default=1536, gt=0)
    llm_timeout_s: float = Field(default=20.0, gt=0)
    embedding_batch_size: int = Field(default=64, gt=0)
    bulk_batch_size: int = Field(default=1000, gt=0)
    vector_top_k: int = Field(default=30, gt=0)
    retrieval_top_k: int = Field(default=5, gt=0)
    retrieval_per_doc_cap: int = Field(default=2, gt=0)
    reranker_model: Optional[str] = Field(default="BAAI/bge-reranker-v2-m3")
    vector_min_score: float = Field(default=0.2, ge=0.0)


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
        index_sp500=os.getenv("INDEX_SP500", "index_sp500"),
        index_phrasebank=os.getenv("INDEX_PHRASEBANK", "index_phrasebank"),
        llm_url=os.getenv("LLM_URL", "http://llm-api:8000"),
        minio_endpoint=os.getenv("MINIO_ENDPOINT", "http://minio:9000"),
        minio_access_key=os.getenv("MINIO_ACCESS_KEY", "minio"),
        minio_secret_key=os.getenv("MINIO_SECRET_KEY", "minio123"),
        request_timeout_s=_coerce_float("REQUEST_TIMEOUT_S", 15.0),
        embedding_dimension=_coerce_int("EMBEDDING_DIMENSION", 1536),
        llm_timeout_s=_coerce_float("LLM_TIMEOUT_S", 20.0),
        embedding_batch_size=_coerce_int("EMBEDDING_BATCH_SIZE", 64),
        bulk_batch_size=_coerce_int("BULK_BATCH_SIZE", 1000),
        vector_top_k=_coerce_int("VECTOR_TOP_K", 30),
        retrieval_top_k=_coerce_int("RETRIEVAL_TOP_K", 5),
        retrieval_per_doc_cap=_coerce_int("RETRIEVAL_PER_DOC_CAP", 2),
        reranker_model=os.getenv("RERANKER_MODEL", "BAAI/bge-reranker-v2-m3") or None,
        vector_min_score=_coerce_float("VECTOR_MIN_SCORE", 0.2),
    )
