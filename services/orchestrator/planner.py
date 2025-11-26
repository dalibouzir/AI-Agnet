"""LLM-driven planner that decides when to call RAG and/or Risk helpers."""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, Sequence

from pydantic import ValidationError

from llm_client import complete
from schemas import Plan
from settings import get_settings

logger = logging.getLogger("uvicorn.error")
settings = get_settings()

SIM_KEYWORDS = (
    "monte carlo",
    "simulate",
    "simulation",
    "risk scenario",
    "probability distribution",
    "distribution of outcomes",
    "forecast scenarios",
    "n paths",
    "10 000 paths",
    "10000 paths",
    "simulate downside",
    "simulate upside",
    "simulate volatility",
    "simulate revenue range",
)


def _default_plan() -> Plan:
    return Plan(needRag=False, needRisk=False, ragQueries=[], riskSpec=None, expected=["summary"], confidence=0.0)


def _render_recalls(recalls: Sequence[Dict[str, Any]]) -> str:
    if not recalls:
        return "None"
    lines = []
    for recall in recalls[:5]:
        text = str(recall.get("text") or "").strip()
        score = recall.get("score")
        if text:
            prefix = f"(score={score}) " if score is not None else ""
            lines.append(f"{prefix}{text}")
    return "\n".join(lines) or "None"


def _looks_definitional(text: str) -> bool:
    lowered = text.lower()
    if re.search(r"\b(what\s+is|what's|define|explain)\b", lowered):
        return True
    return False


async def plan(user_msg: str, short_ctx: str, long_ctx: str, recalls: Sequence[Dict[str, Any]]) -> Plan:
    """Run the planner LLM and return a structured Plan object."""
    lowered_query = user_msg.lower()
    force_risk = any(keyword in lowered_query for keyword in SIM_KEYWORDS)
    planner_prompt = (
        "You are a planning agent. Using the user's message and conversation context, decide if the assistant should "
        "consult DOCUMENTS (RAG) and/or QUANTITATIVE SIMULATION (RISK).\n"
        "Avoid keyword bias—reason about the goal. Return strict JSON:\n"
        "{\n"
        '  "needRag": boolean,\n'
        '  "needRisk": boolean,\n'
        '  "ragQueries": string[],\n'
        '  "riskSpec": { "variables": {...}, "trials": number, "scenarioNotes": string } | null,\n'
        '  "expected": ["citations"|"probabilities"|"charts"|"summary"...],\n'
        '  "confidence": number\n'
        "}\n"
        "When the user wants facts/policies/metrics from files, set needRag=true. "
        "When they need probabilities, Monte Carlo, ROI, or sensitivities, set needRisk=true. "
        "Otherwise both should be false. Respond with JSON only."
    )
    context_block = (
        f"Short-term context:\n{short_ctx or 'None'}\n\n"
        f"Long summary:\n{long_ctx or 'None'}\n\n"
        f"Vector recalls:\n{_render_recalls(recalls)}\n\n"
        f"User message:\n{user_msg}"
    )
    profile_name = settings.writer_profile or "json_structured"
    payload = {
        "system": planner_prompt,
        "messages": [{"role": "user", "content": context_block}],
        "temperature": 0.0,
        "max_tokens": 320,
        "top_p": 0.8,
        "mode": "PLANNER",
        "profile": profile_name,
        "answer_format": "custom",
    }
    try:
        data = await complete(payload)
        raw_text = str(data.get("text") or "").strip()
        plan_payload = json.loads(raw_text)
        plan = Plan(**plan_payload)
        plan.confidence = max(0.0, min(1.0, float(plan.confidence)))
        if not force_risk and _looks_definitional(user_msg):
            plan.needRisk = False
        if force_risk:
            plan.needRisk = True
        return plan
    except (ValidationError, json.JSONDecodeError) as exc:
        logger.warning("Planner JSON parse failed: %s", exc)
        return _default_plan()
    except Exception as exc:  # pragma: no cover - defensive
        logger.error("Planner failed: %s", exc)
        return _default_plan()
