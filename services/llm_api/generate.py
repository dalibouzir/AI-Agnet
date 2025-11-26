"""Helpers for normalising LLM generation requests."""

from __future__ import annotations

from typing import Any, Dict, Optional

from answer_templates import AnswerFormat, format_instructions

DEFAULT_TEMPERATURE = 0.2
DEFAULT_TOP_P = 0.9
DEFAULT_TOP_K = 50
DEFAULT_MAX_TOKENS = 900


def resolve_answer_format(value: str | None) -> AnswerFormat:
    """Return the desired answer format, defaulting to PROSE."""

    return AnswerFormat.from_value(value)


def merge_system_prompt(base_system: Optional[str], answer_format: AnswerFormat) -> str:
    """Combine an optional base system prompt with format-specific instructions."""

    instructions = format_instructions(answer_format)
    if base_system and instructions in base_system:
        return base_system.strip()

    parts: list[str] = []
    if base_system and base_system.strip():
        parts.append(base_system.strip())
    parts.append(instructions)
    return "\n\n".join(parts).strip()


def apply_generation_defaults(kwargs: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure decoding parameters fall back to the agreed presets."""

    updated = dict(kwargs)
    updated.setdefault("temperature", DEFAULT_TEMPERATURE)
    updated.setdefault("top_p", DEFAULT_TOP_P)
    updated.setdefault("top_k", DEFAULT_TOP_K)
    updated.setdefault("max_tokens", DEFAULT_MAX_TOKENS)
    return updated


def ensure_option_defaults(options: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Inject default generation options without mutating the caller input."""

    merged = dict(options or {})
    merged.setdefault("top_k", DEFAULT_TOP_K)
    return merged
