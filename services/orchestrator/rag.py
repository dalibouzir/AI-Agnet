"""RAG service helpers for the orchestrator."""

from __future__ import annotations

from typing import Any, Dict, Iterable, List

import httpx

from settings import get_settings

settings = get_settings()


async def _retrieve(query: str, top_k: int) -> Dict[str, Any]:
    url = f"{settings.rag_url.rstrip('/')}/v1/retrieve"
    payload = {"query": query, "top_k": top_k}
    async with httpx.AsyncClient(timeout=settings.request_timeout_s) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, dict):
            raise RuntimeError("RAG response payload must be a JSON object.")
        return data


async def hybrid_search(queries: Iterable[str], top_k: int = 8) -> List[Dict[str, Any]]:
    hits: List[Dict[str, Any]] = []
    for query in queries:
        if not query:
            continue
        data = await _retrieve(query, top_k)
        chunks = data.get("chunks") or []
        for chunk in chunks:
            if isinstance(chunk, dict):
                record = dict(chunk)
                record["_query"] = query
                hits.append(record)
    return hits


def rerank(hits: Iterable[Dict[str, Any]], k: int = 5) -> List[Dict[str, Any]]:
    scored = sorted(
        (hit for hit in hits if isinstance(hit, dict)),
        key=lambda hit: float(hit.get("score") or 0.0),
        reverse=True,
    )
    return scored[:k]


def estimate_confidence(hits: Iterable[Dict[str, Any]]) -> float:
    top_score = 0.0
    second_score = 0.0
    for hit in hits:
        score = float(hit.get("score") or 0.0)
        if score > top_score:
            second_score = top_score
            top_score = score
        elif score > second_score:
            second_score = score
    if top_score <= 0:
        return 0.0
    spread = top_score - second_score
    return round(min(0.99, max(0.0, 0.5 * top_score + 0.5 * spread)), 3)
