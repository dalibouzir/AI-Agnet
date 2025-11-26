"""Build structured fact cards from S&P 500 table rows."""

from __future__ import annotations

from typing import Iterable, Mapping

METRIC_FIELDS = (
    "revenue",
    "operating_income",
    "net_income",
    "free_cash_flow",
    "total_debt",
)


def build_fact_cards(rows: Iterable[Mapping[str, object]]) -> str:
    """Convert structured rows into concise fact bullets for the LLM prompt."""

    lines: list[str] = []
    for row in rows:
        ticker = str(row.get("ticker") or "").upper().strip()
        year = row.get("year")
        if not ticker or year is None:
            continue
        tag = f"[S&P500 | {ticker} | {year}]"
        for field in METRIC_FIELDS:
            value = row.get(field)
            if value is None or (isinstance(value, str) and not value.strip()):
                continue
            lines.append(f"- {tag} {field}: {value}")

    if not lines:
        return "Facts:\n- Not found in context"

    return "Facts:\n" + "\n".join(lines)
