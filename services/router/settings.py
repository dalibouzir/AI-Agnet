"""Configuration helpers for the router service."""

from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv
from pydantic import BaseModel, Field

load_dotenv()


class Settings(BaseModel):
    app_name: str = Field(default="Router Service")
    orchestrator_url: str = Field(default="http://orchestrator:8000")
    request_timeout_s: float = Field(default=15.0)


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
        orchestrator_url=os.getenv("ORCH_URL", "http://orchestrator:8000"),
        request_timeout_s=_coerce_float("REQUEST_TIMEOUT_S", 15.0),
    )
