"""Utilities to prepare FinancialPhraseBank examples for indexing."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterable, List

REQUIRED_FIELDS = {"label", "text"}


@dataclass(frozen=True)
class PhraseBankRecord:
    text: str
    label: str

    @classmethod
    def from_payload(cls, payload: Dict[str, Any]) -> "PhraseBankRecord":
        missing = REQUIRED_FIELDS - payload.keys()
        if missing:
            raise ValueError(f"PhraseBank record missing required fields: {sorted(missing)}")

        text = str(payload["text"]).strip()
        if not text:
            raise ValueError("PhraseBank text cannot be empty.")

        label = str(payload["label"]).strip().lower().replace(" ", "_")
        if not label:
            raise ValueError("PhraseBank label cannot be empty.")

        return cls(text=text, label=label)

    def to_document(self) -> Dict[str, Any]:
        metadata = {
            "source": "phrasebank",
            "label": self.label,
        }
        return {"text": self.text, "metadata": metadata}


def build_documents(rows: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Normalise raw FinancialPhraseBank rows for indexing."""

    documents: List[Dict[str, Any]] = []
    for row in rows:
        record = PhraseBankRecord.from_payload(row)
        documents.append(record.to_document())
    return documents
