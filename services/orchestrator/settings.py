"""Configuration helpers for the orchestrator service."""

from __future__ import annotations

import os
from functools import lru_cache
import json
from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings
from typing import Dict

load_dotenv()


DEFAULT_FT_MODEL = "ft:gpt-4o-mini-2024-07-18:esprit:ai-business-agent-v1:CaIy8Jh2"


class Settings(BaseSettings):
    model_config = {"protected_namespaces": ()}
    DEFAULT_MODEL: str = Field(default=DEFAULT_FT_MODEL)
    RAG_SCORE_THRESHOLD: float = Field(default=0.18, ge=0.0)
    app_name: str = Field(default="Orchestrator Service")
    rag_url: str = Field(default="http://rag:8000")
    sim_url: str = Field(default="http://sim:8000")
    llm_url: str = Field(default="http://llm-api:8000")
    request_timeout_s: float = Field(default=15.0)
    llm_request_timeout_s: float = Field(default=45.0)
    default_top_k: int = Field(default=5, gt=0)
    max_context_chunks: int = Field(default=5, gt=0)
    excerpt_chars: int = Field(default=320, gt=40)
    classifier_temperature: float = Field(default=0.1, ge=0.0, le=1.0)
    classifier_top_p: float = Field(default=0.9, gt=0.0, le=1.0)
    classifier_max_tokens: int = Field(default=200, gt=0)
    classifier_model: str | None = None
    router_adapter: str | None = None
    writer_model: str | None = None
    writer_adapter: str | None = None
    writer_max_tokens: int = Field(default=256, gt=0)
    writer_profile: str | None = None
    writer_model_rag: str | None = None
    writer_model_risk: str | None = None
    writer_model_llm: str | None = None
    model_routing_table: Dict[str, str] | None = None
    docs_base_url: str | None = None
    work_email: str | None = None
    min_business_confidence: float = Field(default=0.6, ge=0.0, le=1.0)
    risk_default_revenue: float = Field(default=200_000.0, gt=0.0)
    risk_default_margin: float = Field(default=0.18)
    risk_default_rev_sigma: float = Field(default=0.06, ge=0.0)
    risk_default_margin_sigma: float = Field(default=0.02, ge=0.0)
    risk_trials: int = Field(default=10_000, gt=0)
    rag_score_threshold: float = Field(default=0.18, ge=0.0)
    plan_conf_threshold: float = Field(default=0.65, ge=0.0, le=1.0)
    rag_conf_threshold: float = Field(default=0.58, ge=0.0, le=1.0)
    risk_max_trials: int = Field(default=10_000, gt=0)
    memory_short_cap_tokens: int = Field(default=2_000, gt=0)
    summary_update_turns: int = Field(default=6, gt=0)
    early_cut_rag_ms: int = Field(default=900, ge=0)
    target_p95_llm: int = Field(default=2_500, gt=0)
    target_p95_llm_rag: int = Field(default=3_500, gt=0)
    target_p95_llm_risk: int = Field(default=6_000, gt=0)


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


def _coerce_optional(env_name: str) -> str | None:
    raw = os.getenv(env_name)
    return raw if raw else None


def _coerce_model_routing_table(env_name: str) -> Dict[str, str] | None:
    raw = os.getenv(env_name)
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"MODEL_ROUTING_TABLE must be valid JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise RuntimeError("MODEL_ROUTING_TABLE must decode into a JSON object mapping modes to models.")
    routing: Dict[str, str] = {}
    for key, value in data.items():
        if not isinstance(key, str) or not isinstance(value, str):
            raise RuntimeError("MODEL_ROUTING_TABLE keys and values must be strings.")
        routing[key.strip().upper()] = value.strip()
    return routing or None


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    rag_threshold = _coerce_float("RAG_SCORE_THRESHOLD", 0.18)
    default_model = os.getenv("DEFAULT_MODEL", DEFAULT_FT_MODEL)
    return Settings(
        DEFAULT_MODEL=default_model,
        RAG_SCORE_THRESHOLD=rag_threshold,
        rag_url=os.getenv("RAG_URL", "http://rag:8000"),
        sim_url=os.getenv("SIM_URL", "http://sim:8000"),
        llm_url=os.getenv("LLM_URL", "http://llm-api:8000"),
        request_timeout_s=_coerce_float("REQUEST_TIMEOUT_S", 15.0),
        llm_request_timeout_s=_coerce_float("LLM_REQUEST_TIMEOUT_S", 45.0),
        default_top_k=_coerce_int("DEFAULT_TOP_K", 5),
        max_context_chunks=_coerce_int("LLM_MAX_CONTEXT_CHUNKS", 5),
        excerpt_chars=_coerce_int("ANSWER_EXCERPT_CHARS", 320),
        classifier_temperature=_coerce_float("CLASSIFIER_TEMPERATURE", 0.1),
        classifier_top_p=_coerce_float("CLASSIFIER_TOP_P", 0.9),
        classifier_max_tokens=_coerce_int("CLASSIFIER_MAX_TOKENS", 200),
        classifier_model=_coerce_optional("CLASSIFIER_MODEL"),
        router_adapter=_coerce_optional("ROUTER_ADAPTER"),
        writer_model=_coerce_optional("WRITER_MODEL"),
        writer_adapter=_coerce_optional("WRITER_ADAPTER"),
        writer_max_tokens=_coerce_int("WRITER_MAX_TOKENS", 640),
        writer_profile=_coerce_optional("WRITER_PROFILE") or _coerce_optional("PROFILE"),
        writer_model_rag=_coerce_optional("WRITER_MODEL_RAG"),
        writer_model_risk=_coerce_optional("WRITER_MODEL_RISK"),
        writer_model_llm=_coerce_optional("WRITER_MODEL_LLM"),
        model_routing_table=_coerce_model_routing_table("MODEL_ROUTING_TABLE"),
        docs_base_url=_coerce_optional("DOCS_BASE_URL"),
        min_business_confidence=_coerce_float("MIN_BUSINESS_CONFIDENCE", 0.6),
        work_email=_coerce_optional("WORK_EMAIL"),
        risk_default_revenue=_coerce_float("RISK_DEFAULT_REVENUE", 200_000.0),
        risk_default_margin=_coerce_float("RISK_DEFAULT_MARGIN", 0.18),
        risk_default_rev_sigma=_coerce_float("RISK_DEFAULT_REV_SIGMA", 0.06),
        risk_default_margin_sigma=_coerce_float("RISK_DEFAULT_MARGIN_SIGMA", 0.02),
        risk_trials=_coerce_int("RISK_TRIALS", 10_000),
        rag_score_threshold=rag_threshold,
        plan_conf_threshold=_coerce_float("PLAN_CONF_THRESHOLD", 0.65),
        rag_conf_threshold=_coerce_float("RAG_CONF_THRESHOLD", 0.58),
        risk_max_trials=_coerce_int("RISK_MAX_TRIALS", 10_000),
        memory_short_cap_tokens=_coerce_int("MEMORY_SHORT_CAP_TOKENS", 2_000),
        summary_update_turns=_coerce_int("SUMMARY_UPDATE_TURNS", 6),
        early_cut_rag_ms=_coerce_int("EARLY_CUT_RAG_MS", 900),
        target_p95_llm=_coerce_int("TARGET_P95_LLM", 2_500),
        target_p95_llm_rag=_coerce_int("TARGET_P95_LLM_RAG", 3_500),
        target_p95_llm_risk=_coerce_int("TARGET_P95_LLM_RISK", 6_000),
    )
