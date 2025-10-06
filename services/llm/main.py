"""Embedding + completion microservice for RAG pipelines."""

from __future__ import annotations

import math
import re
import logging
from hashlib import blake2b
from typing import List, Optional

from fastapi import FastAPI, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from prometheus_fastapi_instrumentator import Instrumentator
from openai import AsyncOpenAI
from openai import OpenAIError

from settings import get_settings

settings = get_settings()

app = FastAPI(title=settings.app_name)
Instrumentator().instrument(app).expose(app)

logger = logging.getLogger(__name__)


if settings.openai_api_key:
    _openai_client: Optional[AsyncOpenAI] = AsyncOpenAI(  # pragma: no cover - simple config
        api_key=settings.openai_api_key,
        base_url=settings.openai_api_base or None,
        timeout=settings.completion_timeout_s,
    )
else:  # pragma: no cover - fallback path is covered via deterministic unit tests
    _openai_client = None


class EmbedRequest(BaseModel):
    texts: List[str] = Field(default_factory=list)


class EmbedResponse(BaseModel):
    embeddings: List[List[float]]


def _validate_texts(texts: List[str]) -> None:
    if not texts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="'texts' must contain at least one item",
        )
    if len(texts) > settings.max_batch_size:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Batch size exceeds limit of {settings.max_batch_size}",
        )


def _tokenize(text: str) -> List[str]:
    # Lightweight tokenizer that keeps alphanumerics and lowercases for stability.
    return [token for token in re.findall(r"\w+", text.lower()) if token]


def _embed_single(text: str) -> List[float]:
    dimension = settings.embedding_dimension
    vector = [0.0] * dimension

    tokens = _tokenize(text)
    if not tokens:
        return vector

    for position, token in enumerate(tokens):
        token_bytes = f"{position}:{token}".encode("utf-8")
        digest = blake2b(token_bytes, digest_size=16, person=b"rag-embed").digest()
        bucket = int.from_bytes(digest[:8], "big")
        index = bucket % dimension
        magnitude = int.from_bytes(digest[8:], "big") / float(2**64 - 1)
        vector[index] += (magnitude * 2.0) - 1.0

    norm = math.sqrt(sum(value * value for value in vector))
    if norm > 0.0:
        vector = [value / norm for value in vector]

    return vector


def _embed_batch(texts: List[str]) -> List[List[float]]:
    return [_embed_single(text) for text in texts]


class CompletionRequest(BaseModel):
    prompt: str = Field(min_length=1)
    max_tokens: Optional[int] = Field(default=None, gt=0)
    temperature: float = Field(default=0.2, ge=0.0, le=1.0)
    top_p: float = Field(default=1.0, gt=0.0, le=1.0)
    stop: Optional[List[str]] = Field(default=None)


class CompletionResponse(BaseModel):
    completion: str
    model: str
    fallback_used: bool = Field(default=False)


def _fallback_completion(prompt: str) -> str:
    """Return a deterministic summary extracted from the provided context."""

    context_start = prompt.lower().find("context:")
    if context_start != -1:
        context_section = prompt[context_start + len("context:") :]
    else:
        context_section = prompt

    # Keep non-empty lines, strip bullets, and collapse whitespace.
    lines = []
    for raw_line in context_section.splitlines():
        line = raw_line.strip().lstrip("-• ")
        if line:
            lines.append(line)

    if not lines:
        return "I don't have enough information in the provided context to answer."

    summary = " ".join(lines)
    summary = re.sub(r"\s+", " ", summary).strip()
    if len(summary) > 500:
        summary = summary[:497].rsplit(" ", 1)[0] + "..."
    return summary


async def _call_openai(
    prompt: str,
    max_tokens: int,
    temperature: float,
    top_p: float,
    stop: Optional[List[str]],
) -> str:
    if not _openai_client:
        raise RuntimeError("OpenAI client not configured")

    response = await _openai_client.chat.completions.create(
        model=settings.completion_model,
        messages=
        [
            {"role": "system", "content": settings.completion_system_prompt},
            {"role": "user", "content": prompt},
        ],
        max_tokens=max_tokens,
        temperature=temperature,
        top_p=top_p,
        stop=stop,
    )

    if not response.choices:
        raise RuntimeError("No choices returned from OpenAI")

    message = response.choices[0].message
    if not message or not message.content:
        raise RuntimeError("OpenAI response missing content")

    return message.content.strip()


@app.post("/embed", response_model=EmbedResponse)
async def embed_texts(payload: EmbedRequest) -> EmbedResponse:
    _validate_texts(payload.texts)

    embeddings = await run_in_threadpool(_embed_batch, payload.texts)

    if not embeddings or len(embeddings[0]) != settings.embedding_dimension:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Embedding generation failed",
        )

    return EmbedResponse(embeddings=embeddings)


@app.post("/complete", response_model=CompletionResponse)
async def complete_text(payload: CompletionRequest) -> CompletionResponse:
    prompt = payload.prompt.strip()
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="'prompt' must contain non-whitespace text",
        )

    max_tokens = payload.max_tokens or settings.max_completion_tokens
    if max_tokens > settings.max_completion_tokens:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                f"Requested max_tokens ({max_tokens}) exceeds limit of "
                f"{settings.max_completion_tokens}"
            ),
        )

    if _openai_client:
        try:
            completion = await _call_openai(
                prompt=prompt,
                max_tokens=max_tokens,
                temperature=payload.temperature,
                top_p=payload.top_p,
                stop=payload.stop,
            )
            return CompletionResponse(
                completion=completion,
                model=settings.completion_model,
                fallback_used=False,
            )
        except OpenAIError as exc:  # pragma: no cover - upstream library behaviour
            logger.warning("OpenAI API error: %s", exc)
        except Exception as exc:  # pragma: no cover - defensive guard
            logger.warning("OpenAI completion failed, using fallback: %s", exc)

    fallback = _fallback_completion(prompt)
    return CompletionResponse(
        completion=fallback,
        model="fallback",
        fallback_used=True,
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
