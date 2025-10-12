"""Configuration helpers for the orchestrator service."""

from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv
from pydantic import BaseModel, Field

load_dotenv()


class Settings(BaseModel):
    app_name: str = Field(default="Orchestrator Service")
    rag_url: str = Field(default="http://rag:8000")
    request_timeout_s: float = Field(default=15.0)
    llm_url: str = Field(default="http://llm:8000")
    llm_request_timeout_s: float = Field(default=25.0)
    llm_max_prompt_chars: int = Field(default=6000, gt=0)
    llm_max_context_chunks: int = Field(default=5, gt=0)
    answer_max_sources: int = Field(default=5, gt=0)
    answer_excerpt_chars: int = Field(default=320, gt=40)


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
        rag_url=os.getenv("RAG_URL", "http://rag:8000"),
        request_timeout_s=_coerce_float("REQUEST_TIMEOUT_S", 15.0),
        llm_url=os.getenv("LLM_URL", "http://llm:8000"),
        llm_request_timeout_s=_coerce_float("LLM_REQUEST_TIMEOUT_S", 25.0),
        llm_max_prompt_chars=_coerce_int("LLM_MAX_PROMPT_CHARS", 6000),
        llm_max_context_chunks=_coerce_int("LLM_MAX_CONTEXT_CHUNKS", 5),
        answer_max_sources=_coerce_int("ANSWER_MAX_SOURCES", 5),
        answer_excerpt_chars=_coerce_int("ANSWER_EXCERPT_CHARS", 320),
    )
