"""Orchestrator service that composes answers from RAG search results."""

from __future__ import annotations

import logging
from typing import Any, List

import httpx
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field
from prometheus_fastapi_instrumentator import Instrumentator

from settings import get_settings

settings = get_settings()

app = FastAPI(title=settings.app_name)
Instrumentator().instrument(app).expose(app)

logger = logging.getLogger(__name__)


class AskRequest(BaseModel):
    query: str
    top_k: int = Field(default=5, gt=0)


class RagHit(BaseModel):
    score: float
    text: str
    source: str
    metadata: dict[str, Any] | None = None


class SourceInfo(BaseModel):
    source: str
    score: float


class AskResponse(BaseModel):
    answer: str
    sources: List[SourceInfo]


def _http_status_from_exc(exc: httpx.HTTPError) -> int:
    if isinstance(exc, httpx.HTTPStatusError):
        code = exc.response.status_code
        if 400 <= code < 600:
            return code
    return status.HTTP_502_BAD_GATEWAY


def _summarize_hits(hits: List[RagHit]) -> str:
    if not hits:
        return "No relevant information found."

    fragments: List[str] = []
    for hit in hits[:3]:
        snippet = hit.text.strip()
        if snippet:
            fragments.append(snippet)

    if not fragments:
        return "No relevant information found."

    summary = " ".join(fragments)
    if len(summary) > 600:
        summary = summary[:597].rstrip() + "..."
    return summary


def _build_prompt(query: str, hits: List[RagHit]) -> str:
    context_parts: List[str] = []

    for idx, hit in enumerate(hits[: settings.llm_max_context_chunks], start=1):
        snippet = hit.text.strip()
        if not snippet:
            continue
        metadata = hit.metadata or {}
        label = metadata.get("title") or metadata.get("object") or hit.source
        context_parts.append(f"{idx}. Source: {label}\n{snippet}")

    if not context_parts:
        context_block = "No supporting context available."
    else:
        context_block = "\n\n".join(context_parts)

    prompt = (
        "You are the AI Business Agent. Use only the provided context to answer. "
        "If the context does not contain the answer, say you do not know.\n"
        f"Question: {query}\n\nContext:\n{context_block}\n\n"
        "Answer as structured bullet points when appropriate."
    )

    if len(prompt) > settings.llm_max_prompt_chars:
        prompt = prompt[: settings.llm_max_prompt_chars]

    return prompt


async def _generate_answer(query: str, hits: List[RagHit]) -> str:
    if not hits:
        return "No relevant information found."

    prompt = _build_prompt(query, hits)
    payload: dict[str, Any] = {"prompt": prompt}

    url = f"{settings.llm_url.rstrip('/')}/complete"
    try:
        async with httpx.AsyncClient(timeout=settings.llm_request_timeout_s) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPError as exc:  # pragma: no cover - external dependency
        logger.warning("LLM request failed (%s), using fallback", exc)
        return _summarize_hits(hits)

    completion = data.get("completion") if isinstance(data, dict) else None
    if isinstance(completion, str) and completion.strip():
        return completion.strip()

    logger.warning("LLM response missing completion field, using fallback")
    return _summarize_hits(hits)


@app.post("/ask", response_model=AskResponse)
async def ask(request: AskRequest) -> AskResponse:
    payload: dict[str, Any] = {"query": request.query, "top_k": request.top_k}
    url = f"{settings.rag_url.rstrip('/')}/search"

    try:
        async with httpx.AsyncClient(timeout=settings.request_timeout_s) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
    except httpx.HTTPError as exc:  # pragma: no cover - external dependency
        raise HTTPException(
            status_code=_http_status_from_exc(exc),
            detail=f"Failed to query RAG service: {exc}",
        ) from exc

    data = response.json()
    hits_payload = data.get("hits")
    if not isinstance(hits_payload, list):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="RAG service returned an unexpected payload",
        )

    try:
        hits = [RagHit(**hit) for hit in hits_payload]
    except Exception as exc:  # pragma: no cover - defensive guard for schema drift
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to parse RAG hits: {exc}",
        ) from exc

    answer = await _generate_answer(request.query, hits)
    sources = [SourceInfo(source=hit.source, score=hit.score) for hit in hits[: request.top_k]]

    return AskResponse(answer=answer, sources=sources)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
