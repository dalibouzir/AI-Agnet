"""Ollama-backed text generation and deterministic embedding microservice."""

from __future__ import annotations

import json
import logging
import math
import re
import time
from functools import lru_cache
from hashlib import blake2b
from typing import Any, Dict, List, Literal, Optional

import httpx
import yaml
from fastapi import FastAPI, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field, ValidationError, model_validator
from prometheus_fastapi_instrumentator import Instrumentator
from prometheus_client import Counter, Histogram

from settings import get_settings

from answer_templates import AnswerFormat
from generate import (
    apply_generation_defaults,
    ensure_option_defaults,
    merge_system_prompt,
    resolve_answer_format,
)

settings = get_settings()

app = FastAPI(title=settings.app_name)
Instrumentator().instrument(app).expose(app)

logger = logging.getLogger("uvicorn.error")

LLM_REQUEST_DURATION_SECONDS = Histogram(
    "llm_request_duration_seconds",
    "Duration of outbound LLM calls",
    ["provider", "model"],
)
LLM_TIMEOUTS_TOTAL = Counter(
    "llm_timeouts_total",
    "Total number of LLM requests that timed out",
    ["provider"],
)


class FewShotExample(BaseModel):
    user: str = Field(min_length=1)
    assistant: str = Field(min_length=1)


class ProfileConfig(BaseModel):
    system: str = Field(min_length=1)
    style: Dict[str, Any] = Field(default_factory=dict)
    output: Dict[str, Any] = Field(default_factory=dict)
    few_shots: List[FewShotExample] = Field(default_factory=list)


@lru_cache(maxsize=32)
def _load_profile(name: str) -> ProfileConfig:
    path = settings.profiles_dir / f"{name}.yaml"
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise FileNotFoundError(f"Profile '{name}' not found at {path}") from exc
    except OSError as exc:
        raise RuntimeError(f"Failed to read profile '{name}': {exc}") from exc
    try:
        data = yaml.safe_load(raw) or {}
    except yaml.YAMLError as exc:
        raise RuntimeError(f"Profile '{name}' contains invalid YAML: {exc}") from exc
    return ProfileConfig(**data)


def _resolve_profile(name: str) -> ProfileConfig:
    try:
        return _load_profile(name)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Profile '{name}' failed validation: {exc}",
        ) from exc
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc


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


def _resolve_ollama_embedding_url() -> str:
    raw = settings.embedding_ollama_url or settings.ollama_url
    if not raw:
        return "http://ollama:11434/api/embeddings"
    base = raw.rstrip("/")
    if base.endswith("/api/embeddings"):
        return base
    if base.endswith("/api"):
        return f"{base}/embeddings"
    if base.endswith("/api/generate"):
        parent = base.rsplit("/", 1)[0]
        return f"{parent}/embeddings"
    return f"{base}/api/embeddings"


async def _embed_via_ollama(texts: List[str]) -> List[List[float]]:
    url = _resolve_ollama_embedding_url()
    model = settings.embedding_model or "nomic-embed-text"
    timeout = settings.embedding_timeout_s
    vectors: List[List[float]] = []
    async with httpx.AsyncClient(timeout=timeout) as client:
        for text in texts:
            payload = {"model": model, "prompt": text}
            try:
                response = await client.post(url, json=payload)
                response.raise_for_status()
            except httpx.HTTPError as exc:
                raise RuntimeError(f"Ollama embedding request failed: {exc}") from exc
            data = response.json()
            embedding = data.get("embedding")
            if isinstance(embedding, list):
                vectors.append([float(value) for value in embedding])
                continue
            multi = data.get("embeddings")
            if isinstance(multi, list) and multi and isinstance(multi[0], list):
                vectors.append([float(value) for value in multi[0]])
                continue
            raise RuntimeError("Ollama embeddings response missing vector payload")
    return vectors


async def _embed_via_openai(texts: List[str]) -> List[List[float]]:
    api_key = settings.openai_api_key
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required for OpenAI embeddings")
    url = settings.embedding_api_url or f"{settings.openai_base_url.rstrip('/')}/embeddings"
    model = settings.openai_embed_model or settings.embedding_model or settings.openai_model
    timeout = settings.embedding_timeout_s
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {"model": model, "input": texts}
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise RuntimeError(f"OpenAI embedding request failed: {exc}") from exc

    body = response.json()
    data = body.get("data")
    if not isinstance(data, list) or len(data) != len(texts):
        raise RuntimeError("OpenAI embedding response malformed")
    vectors: List[List[float]] = []
    for item in data:
        embedding = item.get("embedding")
        if not isinstance(embedding, list):
            raise RuntimeError("OpenAI embedding response missing vector field")
        vectors.append([float(value) for value in embedding])
    return vectors


def _embedding_backend_sequence() -> List[str]:
    backend = (settings.embedding_backend or "fake").strip().lower()
    if backend == "auto":
        return ["ollama", "openai"]
    if backend == "ollama":
        # Fall back to deterministic embeddings if the Ollama endpoint fails
        return ["ollama", "fake"]
    if backend == "openai":
        return ["openai", "fake"]
    return [backend]


async def _generate_embeddings(texts: List[str]) -> tuple[str, List[List[float]]]:
    errors: List[str] = []
    for backend in _embedding_backend_sequence():
        try:
            if backend == "ollama":
                logger.info(
                    "Embedding backend: Ollama (model=%s, batch=%d)",
                    settings.embedding_model,
                    len(texts),
                )
                return backend, await _embed_via_ollama(texts)
            if backend == "openai":
                logger.info(
                    "Embedding backend: OpenAI (model=%s, batch=%d)",
                    settings.openai_embed_model or settings.embedding_model,
                    len(texts),
                )
                return backend, await _embed_via_openai(texts)
            if backend == "fake":
                logger.info("Embedding backend: Deterministic (batch=%d)", len(texts))
                vectors = await run_in_threadpool(_embed_batch, texts)
                return backend, vectors
            raise RuntimeError(f"Unsupported embedding backend '{backend}'")
        except HTTPException:
            raise
        except Exception as exc:
            message = f"{backend}: {exc}"
            errors.append(message)
            logger.warning("Embedding backend %s failed: %s", backend.upper(), exc)
    raise RuntimeError("; ".join(errors) or "Embedding generation failed")


class Message(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str = Field(min_length=1)


class GenerateRequest(BaseModel):
    prompt: Optional[str] = None
    messages: Optional[List[Message]] = None
    system: Optional[str] = None
    model: Optional[str] = None
    max_tokens: int = Field(default_factory=lambda: settings.default_max_tokens, gt=0)
    temperature: float = Field(default=0.2, ge=0.0, le=1.0)
    top_p: float = Field(default=0.9, gt=0.0, le=1.0)
    top_k: int = Field(default=50, gt=0)
    keep_alive: Optional[str] = None
    adapter: Optional[str] = None
    stop: Optional[List[str]] = None
    options: Optional[Dict[str, Any]] = None
    answer_format: Optional[str] = Field(default=None)

    @model_validator(mode="after")
    def ensure_prompt_or_messages(self) -> "GenerateRequest":
        if (not self.prompt or not self.prompt.strip()) and not self.messages:
            raise ValueError("One of 'prompt' or 'messages' must be provided")
        if self.answer_format:
            self.answer_format = resolve_answer_format(self.answer_format).value
        return self


class GenerateResponse(BaseModel):
    text: str
    model: str
    eval_count: Optional[int] = None
    eval_duration_s: Optional[float] = None
    prompt_eval_count: Optional[int] = None
    prompt_eval_duration_s: Optional[float] = None
    total_duration_s: Optional[float] = None
    raw: Dict[str, Any] = Field(default_factory=dict)
    answer_format: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


CompletionModeLiteral = Literal[
    "LLM",
    "RAG",
    "RISK",
    "PLANNER",
    "LLM_ONLY",
    "LLM_DOCS",
    "LLM_RISK",
    "LLM_DOCS_RISK",
]


class CompleteRequest(BaseModel):
    messages: List[Message] = Field(default_factory=list)
    system: Optional[str] = None
    profile: Optional[str] = None
    mode: Optional[str] = None
    model: Optional[str] = None
    max_tokens: Optional[int] = Field(default=None, gt=0)
    temperature: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    top_p: Optional[float] = Field(default=None, gt=0.0, le=1.0)
    adapter: Optional[str] = None
    stop: Optional[List[str]] = None
    options: Optional[Dict[str, Any]] = None
    keep_alive: Optional[str] = None
    answer_format: Optional[str] = None

    @model_validator(mode="after")
    def ensure_messages_and_mode(self) -> "CompleteRequest":
        if not self.messages:
            raise ValueError("'messages' must contain at least one item")
        if self.mode:
            normalized = self.mode.strip().upper()
            allowed_modes = {
                "LLM",
                "RAG",
                "RISK",
                "PLANNER",
                "LLM_ONLY",
                "LLM_DOCS",
                "LLM_RISK",
                "LLM_DOCS_RISK",
            }
            if normalized not in allowed_modes:
                raise ValueError(
                    "mode must be one of {'LLM', 'RAG', 'RISK', 'PLANNER', 'LLM_ONLY', 'LLM_DOCS', 'LLM_RISK', 'LLM_DOCS_RISK'}"
                )
            self.mode = normalized
        if self.profile:
            profile = self.profile.strip()
            if not profile:
                raise ValueError("'profile' cannot be empty")
            self.profile = profile
        if self.answer_format:
            self.answer_format = resolve_answer_format(self.answer_format).value
        return self


class CompleteResponse(GenerateResponse):
    mode: Optional[CompletionModeLiteral] = None
    profile: Optional[str] = None
    provider: Optional[str] = None


def _coerce_positive_int(value: Any) -> Optional[int]:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def _build_profile_system(profile: ProfileConfig, custom_system: Optional[str], mode: str) -> str:
    segments: List[str] = [profile.system.strip()]
    if custom_system and custom_system.strip():
        segments.append(custom_system.strip())

    directives: List[str] = []
    if mode:
        directives.append(f"Operating mode: {mode}. Tailor the response accordingly and state key risks or citations when relevant.")

    bullet = profile.style.get("bullet")
    if isinstance(bullet, str) and bullet.strip():
        directives.append(f"Use '{bullet.strip()}' for bullet points.")

    numeric_format = profile.style.get("numeric_format")
    if isinstance(numeric_format, str) and numeric_format.strip():
        directives.append(f"Format numbers similar to {numeric_format.strip()} when presenting metrics.")

    prefer_markdown = profile.output.get("prefer_markdown")
    if isinstance(prefer_markdown, bool) and prefer_markdown:
        directives.append("Return the answer in Markdown.")

    if directives:
        directives_block = "Profile directives:\n" + "\n".join(f"- {item}" for item in directives)
        segments.append(directives_block)

    return "\n\n".join(part for part in segments if part).strip()


def _prepare_complete_request(payload: CompleteRequest) -> tuple[GenerateRequest, str, ProfileConfig, str, str]:
    profile_name = payload.profile or settings.default_profile
    mode = payload.mode or "LLM"
    profile = _resolve_profile(profile_name)

    system_prompt = _build_profile_system(profile, payload.system, mode)
    answer_format = resolve_answer_format(payload.answer_format)

    messages: List[Message] = []
    for example in profile.few_shots:
        messages.append(Message(role="user", content=example.user))
        messages.append(Message(role="assistant", content=example.assistant))
    for msg in payload.messages:
        messages.append(Message(role=msg.role, content=msg.content))

    profile_max_tokens = _coerce_positive_int(profile.output.get("max_tokens"))
    desired_max_tokens = payload.max_tokens or profile_max_tokens or settings.default_max_tokens

    allowed_model = settings.allowed_model_id or settings.model_name
    request_kwargs: Dict[str, Any] = {
        "system": system_prompt,
        "messages": messages,
        "model": payload.model or allowed_model,
        "max_tokens": desired_max_tokens,
        "answer_format": answer_format.value,
    }
    if payload.temperature is not None:
        request_kwargs["temperature"] = payload.temperature
    if payload.top_p is not None:
        request_kwargs["top_p"] = payload.top_p
    if payload.adapter:
        request_kwargs["adapter"] = payload.adapter
    if payload.stop:
        request_kwargs["stop"] = payload.stop
    if payload.options:
        request_kwargs["options"] = payload.options
    if payload.keep_alive:
        request_kwargs["keep_alive"] = payload.keep_alive

    request_kwargs = apply_generation_defaults(request_kwargs)
    generate_request = GenerateRequest(**request_kwargs)
    return generate_request, profile_name, profile, system_prompt, mode


class CompletionRequest(BaseModel):
    prompt: str = Field(min_length=1)
    max_tokens: Optional[int] = Field(default=None, gt=0)
    temperature: float = Field(default=0.2, ge=0.0, le=1.0)
    top_p: float = Field(default=0.9, gt=0.0, le=1.0)
    model: Optional[str] = None
    adapter: Optional[str] = None
    stop: Optional[List[str]] = None


class CompletionResponse(BaseModel):
    completion: str
    model: str
    fallback_used: bool = Field(default=False)
    metadata: Dict[str, Any] = Field(default_factory=dict)


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


def _normalize_duration_ns(raw: Any) -> Optional[float]:
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return None
    if value < 0:
        return None
    # Ollama returns durations in nanoseconds.
    return value / 1_000_000_000


def _build_prompt(payload: GenerateRequest) -> str:
    segments: List[str] = []

    if payload.system and payload.system.strip():
        segments.append(payload.system.strip())

    if payload.messages:
        for message in payload.messages:
            content = message.content.strip()
            if not content:
                continue
            segments.append(f"{message.role.title()}: {content}")

    if payload.prompt and payload.prompt.strip():
        segments.append(payload.prompt.strip())

    prompt = "\n\n".join(segment for segment in segments if segment)
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Prompt and messages were empty after trimming",
        )
    return prompt


def _extract_user_text(payload: GenerateRequest) -> str:
    if payload.messages:
        for message in reversed(payload.messages):
            if message.role == "user" and message.content.strip():
                return message.content.strip()
    if payload.prompt and payload.prompt.strip():
        return payload.prompt.strip()
    return ""


def _infer_mode_from_text(text: str) -> str:
    lowered = text.lower()
    if any(keyword in lowered for keyword in ["monte carlo", "scenario", "simulate", "risk model", "stress test"]):
        return "risk"
    if any(keyword in lowered for keyword in ["cite", "source", "dataset", "upload", "document", "ingestion", "latest report", "evidence"]):
        return "rag"
    return "llm"


def _enforce_allowed_model(payload: GenerateRequest) -> GenerateRequest:
    allowed = settings.allowed_model_id
    requested = payload.model or settings.model_name or allowed
    candidate = str(requested).strip()
    if candidate != allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"ERROR: MODEL_NOT_ALLOWED. Requested={candidate} Allowed={allowed}",
        )
    return payload.model_copy(update={"model": allowed})


def _response_metadata(model_id: str, payload: GenerateRequest, tokens_in: Optional[int], tokens_out: Optional[int]) -> Dict[str, Any]:
    return {
        "model_id": model_id,
        "decoding": {
            "temperature": payload.temperature,
            "top_p": payload.top_p,
        },
        "tokens_in": int(tokens_in or 0),
        "tokens_out": int(tokens_out or 0),
    }


def _fake_generate(payload: GenerateRequest) -> GenerateResponse:
    user_text = _extract_user_text(payload)
    mode = _infer_mode_from_text(user_text)
    answer_format = resolve_answer_format(payload.answer_format)

    if answer_format is AnswerFormat.JSON:
        text = json.dumps(
            {
                "summary": "Offline placeholder while the real model is disabled.",
                "facts": ["Not found in context"],
                "analysis": f"Router suggested {mode.upper()} mode for the prompt preview.",
                "actions": [
                    "Connect the qwen2.5:1.5b-instruct model in Ollama.",
                    "Re-run the request once the model is available.",
                    "Capture outputs for the golden routing tests.",
                ],
            }
        )
    else:
        summary = user_text or "No detailed prompt provided."
        text = "\n".join(
            [
                "Executive Summary:",
                f"{summary[:120]}",
                "The system is in fake provider mode; no live simulation or retrieval ran.",
                "",
                "Key Facts:",
                "- Not found in context",
                "",
                "Why It Matters:",
                "- Preserves the executive template contract while backends are offline.",
                "",
                "Next Best Actions:",
                "- Connect the qwen2.5:1.5b-instruct model in Ollama.",
                "- Re-run the prompt to validate real responses.",
                "- Record outputs for regression baselines.",
            ]
        )

    model_id = payload.model or settings.allowed_model_id or settings.model_name or "fake-llm"
    metadata = _response_metadata(model_id, payload, 0, 0)
    return GenerateResponse(
        text=text,
        model=model_id,
        raw={
            "provider": "fake",
            "mode": mode,
            "heuristic": True,
        },
        answer_format=answer_format.value,
        metadata=metadata,
    )


def _prepare_openai_messages(payload: GenerateRequest) -> List[Dict[str, str]]:
    messages: List[Dict[str, str]] = []

    if payload.system and payload.system.strip():
        messages.append({"role": "system", "content": payload.system.strip()})

    if payload.messages:
        for message in payload.messages:
            content = message.content.strip()
            if not content:
                continue
            messages.append({"role": message.role, "content": content})

    if payload.prompt and payload.prompt.strip():
        messages.append({"role": "user", "content": payload.prompt.strip()})

    if not messages:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Prompt and messages were empty after trimming",
        )
    return messages


async def _call_openai(payload: GenerateRequest) -> GenerateResponse:
    if not settings.openai_api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="OPENAI_API_KEY is not configured",
        )

    answer_format = resolve_answer_format(payload.answer_format)
    merged_system = merge_system_prompt(payload.system, answer_format)
    if merged_system != (payload.system or "").strip():
        payload = payload.model_copy(update={"system": merged_system, "answer_format": answer_format.value})
    else:
        payload = payload.model_copy(update={"answer_format": answer_format.value})

    messages = _prepare_openai_messages(payload)
    target_model = payload.model or settings.allowed_model_id or settings.model_name
    request_body: Dict[str, Any] = {
        "model": target_model,
        "messages": messages,
        "temperature": payload.temperature,
        "top_p": payload.top_p,
        "max_tokens": payload.max_tokens,
    }
    if payload.stop:
        request_body["stop"] = payload.stop

    url = settings.openai_base_url.rstrip("/") + "/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.openai_api_key}",
        "Content-Type": "application/json",
    }

    start = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=settings.openai_timeout_s) as client:
            response = await client.post(url, headers=headers, json=request_body)
            response.raise_for_status()
    except httpx.TimeoutException as exc:
        LLM_TIMEOUTS_TOTAL.labels("openai").inc()
        logger.warning("Timeout while waiting for OpenAI response")
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Timed out while waiting for OpenAI",
        ) from exc
    except httpx.HTTPStatusError as exc:
        logger.error("OpenAI request failed: %s", exc.response.text)
        status_code = exc.response.status_code
        detail = exc.response.text or str(exc)
        raise HTTPException(
            status_code=status_code if 400 <= status_code < 600 else status.HTTP_502_BAD_GATEWAY,
            detail=f"OpenAI request failed: {detail}",
        ) from exc
    except httpx.HTTPError as exc:
        logger.error("OpenAI request failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"OpenAI request failed: {exc}",
        ) from exc
    finally:
        duration = time.perf_counter() - start
        model_name = str(request_body.get("model"))
        LLM_REQUEST_DURATION_SECONDS.labels("openai", model_name).observe(duration)
        if duration > settings.slow_request_threshold_s:
            logger.warning(
                "Slow OpenAI response (%.2fs) for model=%s prompt_chars=%d",
                duration,
                model_name,
                len(json.dumps(messages)),
            )

    try:
        data = response.json()
    except ValueError as exc:  # pragma: no cover - defensive
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="OpenAI response was not valid JSON",
        ) from exc

    choices = data.get("choices") or []
    if not choices:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="OpenAI response missing choices",
        )
    message = choices[0].get("message") or {}
    text = (message.get("content") or "").strip()
    if not text:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="OpenAI response missing text content",
        )

    usage = data.get("usage") or {}

    reported_model = str(data.get("model") or request_body["model"])
    metadata = _response_metadata(reported_model, payload, usage.get("prompt_tokens"), usage.get("completion_tokens"))

    return GenerateResponse(
        text=text,
        model=reported_model,
        eval_count=usage.get("completion_tokens"),
        eval_duration_s=None,
        prompt_eval_count=usage.get("prompt_tokens"),
        prompt_eval_duration_s=None,
        total_duration_s=None,
        raw=data,
        answer_format=answer_format.value,
        metadata=metadata,
    )


async def _call_ollama(payload: GenerateRequest) -> GenerateResponse:

    answer_format = resolve_answer_format(payload.answer_format)
    merged_system = merge_system_prompt(payload.system, answer_format)
    if merged_system != (payload.system or "").strip():
        payload = payload.model_copy(update={"system": merged_system, "answer_format": answer_format.value})
    else:
        payload = payload.model_copy(update={"answer_format": answer_format.value})

    prompt = _build_prompt(payload)
    request_body: Dict[str, Any] = {
        "model": payload.model or settings.ollama_model,
        "prompt": prompt,
        "stream": False,
    }

    options: Dict[str, Any] = ensure_option_defaults(settings.ollama_default_options)
    if payload.options:
        options.update(payload.options)
    options.update(
        {
            "temperature": payload.temperature,
            "top_p": payload.top_p,
            "top_k": payload.top_k,
            "num_predict": payload.max_tokens,
        }
    )
    if payload.adapter:
        options["adapter"] = payload.adapter
    if options:
        request_body["options"] = options

    keep_alive = payload.keep_alive or settings.ollama_keep_alive
    if keep_alive:
        request_body["keep_alive"] = keep_alive

    if payload.stop:
        request_body["stop"] = payload.stop

    start = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=settings.ollama_timeout_s) as client:
            response = await client.post(settings.ollama_url, json=request_body)
            response.raise_for_status()
    except httpx.TimeoutException as exc:
        LLM_TIMEOUTS_TOTAL.labels("ollama").inc()
        logger.warning("Timeout while waiting for Ollama response")
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Timed out while waiting for Ollama",
        ) from exc
    except httpx.HTTPError as exc:
        logger.error("Ollama request failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Ollama request failed: {exc}",
        ) from exc
    finally:
        duration = time.perf_counter() - start
        model_name = str(request_body.get("model"))
        LLM_REQUEST_DURATION_SECONDS.labels("ollama", model_name).observe(duration)
        if duration > settings.slow_request_threshold_s:
            logger.warning(
                "Slow Ollama response (%.2fs) for model=%s prompt_chars=%d",
                duration,
                model_name,
                len(prompt),
            )

    data = response.json()
    text = data.get("response")
    if not isinstance(text, str) or not text.strip():
        logger.warning("Ollama response missing 'response' field or empty")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Ollama response missing text",
        )

    reported_model = str(data.get("model") or request_body["model"])
    metadata = _response_metadata(reported_model, payload, data.get("prompt_eval_count"), data.get("eval_count"))

    return GenerateResponse(
        text=text.strip(),
        model=reported_model,
        eval_count=data.get("eval_count"),
        eval_duration_s=_normalize_duration_ns(data.get("eval_duration")),
        prompt_eval_count=data.get("prompt_eval_count"),
        prompt_eval_duration_s=_normalize_duration_ns(data.get("prompt_eval_duration")),
        total_duration_s=_normalize_duration_ns(data.get("total_duration")),
        raw=data,
        answer_format=answer_format.value,
        metadata=metadata,
    )


async def _call_llm(payload: GenerateRequest) -> GenerateResponse:
    normalized = _enforce_allowed_model(payload)
    provider = (settings.llm_provider or "ollama").lower()
    if provider == "fake":
        return _fake_generate(normalized)
    if provider == "openai":
        return await _call_openai(normalized)
    return await _call_ollama(normalized)


@app.post("/embed", response_model=EmbedResponse)
async def embed_texts(payload: EmbedRequest) -> EmbedResponse:
    _validate_texts(payload.texts)

    try:
        backend, embeddings = await _generate_embeddings(payload.texts)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    if not embeddings or len(embeddings[0]) != settings.embedding_dimension:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Embedding generation failed",
        )

    logger.info(
        "Generated %d embeddings via %s backend (dims=%d)",
        len(embeddings),
        backend.upper(),
        len(embeddings[0]),
    )

    return EmbedResponse(embeddings=embeddings)


@app.post("/v1/complete", response_model=CompleteResponse)
async def complete_with_profile(payload: CompleteRequest) -> CompleteResponse:
    request_payload, profile_name, profile_cfg, system_prompt, mode = _prepare_complete_request(payload)
    normalized_payload = _enforce_allowed_model(request_payload)

    if settings.llm_provider.lower() == "fake":
        fake_response = _fake_generate(normalized_payload)
        raw_payload = dict(fake_response.raw)
        raw_payload["profile"] = {
            "name": profile_name,
            "mode": mode,
            "style": profile_cfg.style,
            "output": profile_cfg.output,
            "system": system_prompt,
        }
        return CompleteResponse(
            text=fake_response.text,
            model=fake_response.model,
            eval_count=fake_response.eval_count,
            eval_duration_s=fake_response.eval_duration_s,
            prompt_eval_count=fake_response.prompt_eval_count,
            prompt_eval_duration_s=fake_response.prompt_eval_duration_s,
            total_duration_s=fake_response.total_duration_s,
            raw=raw_payload,
            mode=mode,
            profile=profile_name,
            provider="fake",
            answer_format=fake_response.answer_format,
            metadata=fake_response.metadata,
        )

    result = await _call_llm(normalized_payload)

    base_raw = result.raw if isinstance(result.raw, dict) else {}
    raw_payload = dict(base_raw)
    raw_payload["profile"] = {
        "name": profile_name,
        "mode": mode,
        "style": profile_cfg.style,
        "output": profile_cfg.output,
        "system": system_prompt,
        "answer_format": result.answer_format,
    }

    return CompleteResponse(
        text=result.text,
        model=result.model,
        eval_count=result.eval_count,
        eval_duration_s=result.eval_duration_s,
        prompt_eval_count=result.prompt_eval_count,
        prompt_eval_duration_s=result.prompt_eval_duration_s,
        total_duration_s=result.total_duration_s,
        raw=raw_payload,
        mode=mode,
        profile=profile_name,
        provider=settings.llm_provider,
        answer_format=result.answer_format,
        metadata=result.metadata,
    )


@app.post("/v1/generate", response_model=GenerateResponse)
async def generate(payload: GenerateRequest) -> GenerateResponse:
    return await _call_llm(payload)


@app.post("/complete", response_model=CompletionResponse)
async def complete_text(payload: CompletionRequest) -> CompletionResponse:
    request = GenerateRequest(
        prompt=payload.prompt,
        model=payload.model,
        adapter=payload.adapter,
        stop=payload.stop,
        max_tokens=payload.max_tokens or settings.default_max_tokens,
        temperature=payload.temperature,
        top_p=payload.top_p,
    )

    response = await _call_llm(request)
    return CompletionResponse(
        completion=response.text,
        model=response.model,
        fallback_used=False,
        metadata=response.metadata,
    )


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}
