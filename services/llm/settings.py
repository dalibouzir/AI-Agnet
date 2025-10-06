"""Configuration helpers for the LLM service."""

from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv
from pydantic import BaseModel, Field

load_dotenv()


class Settings(BaseModel):
    app_name: str = Field(default="LLM Service")
    embedding_dimension: int = Field(default=1536, gt=0)
    max_batch_size: int = Field(default=256, gt=0)
    openai_api_key: str | None = Field(default=None)
    openai_api_base: str | None = Field(default=None)
    completion_model: str = Field(default="gpt-4o-mini")
    completion_timeout_s: float = Field(default=30.0, gt=0)
    max_completion_tokens: int = Field(default=512, gt=0)
    completion_system_prompt: str = Field(
        default=(
            "You are the AI Business Agent. Use only the provided context to answer. "
            "If the context does not contain the answer, say you do not know."
        )
    )


def _coerce_int(env_name: str, default: int) -> int:
    raw = os.getenv(env_name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError as exc:  # pragma: no cover - defensive guard
        raise RuntimeError(f"Invalid integer for {env_name}: {raw}") from exc

def _coerce_float(env_name: str, default: float) -> float:
    raw = os.getenv(env_name)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError as exc:  # pragma: no cover - defensive guard
        raise RuntimeError(f"Invalid float for {env_name}: {raw}") from exc


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        embedding_dimension=_coerce_int("EMBEDDING_DIMENSION", 1536),
        max_batch_size=_coerce_int("EMBED_MAX_BATCH", 256),
        openai_api_key=os.getenv("OPENAI_API_KEY"),
        openai_api_base=os.getenv("OPENAI_API_BASE"),
        completion_model=os.getenv("OPENAI_COMPLETION_MODEL", "gpt-4o-mini"),
        completion_timeout_s=_coerce_float("OPENAI_COMPLETION_TIMEOUT", 30.0),
        max_completion_tokens=_coerce_int("OPENAI_COMPLETION_MAX_TOKENS", 512),
        completion_system_prompt=os.getenv("OPENAI_COMPLETION_SYSTEM_PROMPT")
        or (
            "You are the AI Business Agent. Use only the provided context to answer. "
            "If the context does not contain the answer, say you do not know."
        ),
    )
