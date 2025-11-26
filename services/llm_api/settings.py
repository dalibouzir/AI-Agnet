"""Configuration helpers for the LLM API service."""

from __future__ import annotations

import os
import json
from functools import lru_cache
from pathlib import Path
from typing import Optional, Dict, Any

from dotenv import load_dotenv
from pydantic import BaseModel, Field

load_dotenv()

ALLOWED_MODEL_ID = os.getenv("ALLOWED_LLM_MODEL", "ft:gpt-4o-mini-2024-07-18:esprit:ai-business-agent-v1")
DEFAULT_MODEL = ALLOWED_MODEL_ID


class Settings(BaseModel):
    app_name: str = Field(default="LLM API Service")
    embedding_dimension: int = Field(default=1536, gt=0)
    max_batch_size: int = Field(default=256, gt=0)
    default_max_tokens: int = Field(default=900, gt=0)
    embedding_backend: str = Field(default="fake")
    embedding_model: str = Field(default="text-embedding-3-small")
    openai_embed_model: str = Field(default="text-embedding-3-small")
    embedding_api_url: str = Field(default="https://api.openai.com/v1/embeddings")
    embedding_ollama_url: str = Field(default="http://ollama:11434/api/embeddings")
    embedding_timeout_s: float = Field(default=60.0, gt=0)
    ollama_url: str = Field(default="http://llama:11434/api/generate")
    ollama_model: str = Field(default="phi3:mini-4k-instruct")
    ollama_timeout_s: float = Field(default=120.0, gt=0)
    ollama_keep_alive: Optional[str] = Field(default="5m")
    llm_provider: str = Field(default="openai")
    model_name: str = Field(default="phi3:mini-4k-instruct")
    openai_api_key: Optional[str] = None
    openai_model: str = Field(default=DEFAULT_MODEL)
    openai_base_url: str = Field(default="https://api.openai.com/v1")
    openai_timeout_s: float = Field(default=60.0, gt=0)
    default_profile: str = Field(default="business_default")
    profiles_dir: Path = Field(default_factory=lambda: Path(__file__).resolve().parent / "profiles")
    slow_request_threshold_s: float = Field(default=45.0, gt=0)
    ollama_default_options: Dict[str, Any] = Field(default_factory=dict)
    allowed_model_id: str = Field(default=ALLOWED_MODEL_ID)


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


def _coerce_json_dict(env_name: str) -> Dict[str, Any]:
    raw = os.getenv(env_name)
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:  # pragma: no cover - defensive guard
        raise RuntimeError(f"{env_name} must be valid JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise RuntimeError(f"{env_name} must decode to a JSON object.")
    return data


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    resolved_model = (
        os.getenv("MODEL_NAME")
        or os.getenv("DEFAULT_LLM_MODEL")
        or os.getenv("OPENAI_MODEL")
        or os.getenv("OLLAMA_MODEL")
        or DEFAULT_MODEL
    )
    profiles_dir_env = os.getenv("PROFILES_DIR")
    profiles_dir = (
        Path(profiles_dir_env).resolve()
        if profiles_dir_env
        else Path(__file__).resolve().parent / "profiles"
    )

    return Settings(
        embedding_dimension=_coerce_int("EMBEDDING_DIMENSION", 1536),
        max_batch_size=_coerce_int("EMBED_MAX_BATCH", 256),
        default_max_tokens=_coerce_int("LLM_MAX_TOKENS", 900),
        embedding_backend=os.getenv("EMBEDDING_BACKEND") or os.getenv("EMBED_PROVIDER", "fake"),
        embedding_model=os.getenv("EMBEDDING_MODEL")
        or os.getenv("EMBED_MODEL")
        or os.getenv("OPENAI_EMBED_MODEL", "text-embedding-3-small"),
        openai_embed_model=os.getenv("OPENAI_EMBED_MODEL", "text-embedding-3-small"),
        embedding_api_url=os.getenv("EMBEDDING_API_URL", "https://api.openai.com/v1/embeddings"),
        embedding_ollama_url=os.getenv("EMBEDDING_OLLAMA_URL")
        or os.getenv("OLLAMA_HOST", "http://llama:11434"),
        embedding_timeout_s=_coerce_float("EMBEDDING_TIMEOUT_S", 60.0),
        ollama_url=os.getenv("OLLAMA_URL", "http://llama:11434/api/generate"),
        ollama_model=resolved_model,
        ollama_timeout_s=_coerce_float("OLLAMA_TIMEOUT_S", 120.0),
        ollama_keep_alive=os.getenv("OLLAMA_KEEP_ALIVE", "5m") or None,
        llm_provider=os.getenv("LLM_PROVIDER", "openai"),
        model_name=resolved_model,
        openai_api_key=os.getenv("OPENAI_API_KEY"),
        openai_model=os.getenv("OPENAI_MODEL", resolved_model),
        openai_base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
        openai_timeout_s=_coerce_float("OPENAI_TIMEOUT_S", 60.0),
        default_profile=os.getenv("PROFILE", "business_default"),
        profiles_dir=profiles_dir,
        slow_request_threshold_s=_coerce_float("SLOW_REQUEST_THRESHOLD_S", 45.0),
        ollama_default_options=_coerce_json_dict("OLLAMA_DEFAULT_OPTIONS"),
        allowed_model_id=ALLOWED_MODEL_ID,
    )
