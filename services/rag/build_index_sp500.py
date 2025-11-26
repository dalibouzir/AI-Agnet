"""Helpers to prepare structured S&P 500 fact cards for indexing."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterable, List

REQUIRED_FIELDS = {"ticker", "year", "field", "value"}
DEFAULT_TABLE = "financials"


@dataclass(frozen=True)
class Sp500Record:
    ticker: str
    year: int
    field: str
    value: str
    table: str = DEFAULT_TABLE

    @classmethod
    def from_payload(cls, payload: Dict[str, Any]) -> "Sp500Record":
        missing = REQUIRED_FIELDS - payload.keys()
        if missing:
            raise ValueError(f"S&P500 record missing required fields: {sorted(missing)}")

        ticker = str(payload["ticker"]).upper().strip()
        if not ticker:
            raise ValueError("Ticker cannot be empty.")

        try:
            year = int(payload["year"])
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Invalid year: {payload['year']}") from exc
        if year < 1900 or year > 2100:
            raise ValueError(f"Year out of expected range: {year}")

        field = str(payload["field"]).strip().lower().replace(" ", "_")
        if not field:
            raise ValueError("Field cannot be empty.")

        value_raw = payload["value"]
        value = f"{value_raw}"
        table = str(payload.get("table") or DEFAULT_TABLE).strip().lower().replace(" ", "_")

        return cls(ticker=ticker, year=year, field=field, value=value, table=table)

    def to_document(self) -> Dict[str, Any]:
        text = f"{self.ticker} {self.field} in {self.year}: {self.value}"
        metadata = {
            "source": "sp500",
            "ticker": self.ticker,
            "year": self.year,
            "table": self.table,
            "field": self.field,
        }
        return {"text": text, "metadata": metadata}


def build_documents(rows: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Normalise raw rows into OpenSearch-ready documents."""

    documents: List[Dict[str, Any]] = []
    for row in rows:
        record = Sp500Record.from_payload(row)
        documents.append(record.to_document())
    return documents
