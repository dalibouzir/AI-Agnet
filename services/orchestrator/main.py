"""Orchestrator service that composes answers from RAG search results."""

from __future__ import annotations

import logging
from pathlib import Path
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
    title: str
    score: float
    path: str
    preview: str


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


def _derive_title(hit: RagHit) -> str:
    metadata = hit.metadata or {}
    title = metadata.get("title") or metadata.get("filename")
    if not title:
        object_path = metadata.get("object")
        if object_path:
            title = Path(object_path).name
    if not title:
        title = Path(hit.source).name if "/" in hit.source else hit.source
    return title or "Unnamed Source"


def _derive_path(hit: RagHit) -> str:
    metadata = hit.metadata or {}
    return metadata.get("object") or metadata.get("raw_path") or hit.source


def _excerpt(text: str, limit: int) -> str:
    cleaned = " ".join(text.split())
    if len(cleaned) <= limit:
        return cleaned if cleaned else "(no text in chunk)"
    truncated = cleaned[: limit - 3]
    if " " in truncated:
        truncated = truncated.rsplit(" ", 1)[0]
    return truncated + "..."


def _format_structured_answer(query: str, hits: List[RagHit]) -> str:
    if not hits:
        return "Query: {query}\n\nKey Findings:\n- No relevant information found."

    lines: List[str] = [f"Query: {query}", "", "Key Findings:"]
    for idx, hit in enumerate(hits[: settings.answer_max_sources], start=1):
        title = _derive_title(hit)
        path = _derive_path(hit)
        preview = _excerpt(hit.text, settings.answer_excerpt_chars)
        lines.append(f"{idx}. {title} (score {hit.score:.2f})")
        lines.append(f"   Path: {path}")
        lines.append(f"   Excerpt: {preview}")
    remaining = len(hits) - settings.answer_max_sources
    if remaining > 0:
        lines.append(f"... {remaining} additional matches available.")
    return "\n".join(lines)


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

    structured = _format_structured_answer(request.query, hits)
    summary = await _generate_answer(request.query, hits)
    answer = structured
    if summary and summary.strip() and summary.strip().lower() not in {"no relevant information found.", "no relevant information found"}:
        answer = f"{structured}\n\n---\nSummary:\n{summary}"

    sources: List[SourceInfo] = []
    for hit in hits[: settings.answer_max_sources]:
        sources.append(
            SourceInfo(
                title=_derive_title(hit),
                score=hit.score,
                path=_derive_path(hit),
                preview=_excerpt(hit.text, settings.answer_excerpt_chars),
            )
        )

    return AskResponse(answer=answer, sources=sources)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
