"""Reusable response format templates for the AI Business Agent."""

from __future__ import annotations

from enum import Enum

PROSE_TEMPLATE = (
    "You are the AI Business Agent. Structure every answer exactly as:\n"
    "1) Executive Summary (2–3 lines)\n"
    "2) Key Facts (bullets; cite retrieved numbers like [S&P500 | TICKER | YEAR])\n"
    "3) Why It Matters\n"
    "4) Next Best Actions (3 bullets)\n"
    "Rules:\n"
    "- If a number is missing from the provided context, respond with \"Not found in context\".\n"
    "- Keep the entire answer under 220 words.\n"
    "- Stay concise, authoritative, and business focused."
)

JSON_TEMPLATE = (
    "Return ONLY valid JSON using this schema with double-quoted keys:\n"
    '{"summary":string,"facts":string[],"analysis":string,"actions":string[]}\n'
    "Do not wrap the JSON in Markdown fences or add commentary."
)


class AnswerFormat(str, Enum):
    """Supported response formats for downstream consumers."""

    PROSE = "prose"
    JSON = "json"
    CUSTOM = "custom"

    @classmethod
    def from_value(cls, value: str | None) -> "AnswerFormat":
        if not value:
            return cls.PROSE
        try:
            return cls(value.strip().lower())
        except ValueError as exc:
            raise ValueError(f"Unsupported answer format: {value!r}") from exc


def format_instructions(answer_format: AnswerFormat) -> str:
    """Return the format-specific instructions to append to the system prompt."""

    if answer_format is AnswerFormat.CUSTOM:
        return ""
    if answer_format is AnswerFormat.JSON:
        return JSON_TEMPLATE
    return PROSE_TEMPLATE
