"""Shared data models for the orchestrator."""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class Plan(BaseModel):
    """Planner output describing which specialist helpers to invoke."""

    needRag: bool
    needRisk: bool
    ragQueries: List[str] = Field(default_factory=list)
    riskSpec: Optional[Dict[str, Any]] = None  # {variables, trials, scenarioNotes}
    expected: List[Literal["citations", "probabilities", "charts", "summary"]] = Field(default_factory=list)
    confidence: float


class FinalDraft(BaseModel):
    """LLM synthesis payload before final response assembly."""

    text: str
    citations: List[Dict[str, str]] = Field(default_factory=list)
    charts: Optional[Dict[str, Any]] = None
    metrics: Dict[str, float] = Field(default_factory=dict)
    model: Optional[str] = None


class AssistantResponse(BaseModel):
    """Standard envelope returned to downstream consumers."""

    route: Literal["LLM_ONLY", "RAG", "RISK", "RAG_RISK"] = "LLM_ONLY"
    text: str
    used: Dict[str, Any] = Field(default_factory=dict)
    citations: List[Dict[str, str]] = Field(default_factory=list)
    charts: Optional[Dict[str, Any]] = None
    memory: Dict[str, Any] = Field(default_factory=dict)
    metrics: Dict[str, float]
    telemetry: Dict[str, Any]
    meta: Dict[str, Any] = Field(default_factory=dict)
