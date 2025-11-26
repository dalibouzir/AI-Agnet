"""Router service that proxies client requests to the orchestrator."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import httpx
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field, model_validator
from prometheus_fastapi_instrumentator import Instrumentator

from settings import get_settings

settings = get_settings()
app = FastAPI(title=settings.app_name)
Instrumentator().instrument(app).expose(app)


class QueryRequest(BaseModel):
    thread_id: Optional[str] = Field(default=None)
    message: Optional[str] = Field(default=None, min_length=1)
    query: Optional[str] = Field(default=None, min_length=1)
    meta: Dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def normalize(self) -> "QueryRequest":
        if not self.message and self.query:
            self.message = self.query
        if not self.thread_id:
            hint = self.meta.get("thread_id") or self.meta.get("threadId")
            self.thread_id = str(hint) if hint else "default"
        return self


class AssistantResponse(BaseModel):
    route: str
    text: str
    used: Dict[str, Any] = Field(default_factory=dict)
    citations: List[Dict[str, Any]] = Field(default_factory=list)
    charts: Optional[Dict[str, Any]] = None
    memory: Dict[str, Any] = Field(default_factory=dict)
    metrics: Dict[str, Any] = Field(default_factory=dict)
    telemetry: Dict[str, Any] = Field(default_factory=dict)
    meta: Dict[str, Any] = Field(default_factory=dict)


def _http_status_from_exc(exc: httpx.HTTPError) -> int:
    if isinstance(exc, httpx.HTTPStatusError):
        code = exc.response.status_code
        if 400 <= code < 600:
            return code
    return status.HTTP_502_BAD_GATEWAY


async def _post_to_orchestrator(path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    url = f"{settings.orchestrator_url.rstrip('/')}{path}"
    async with httpx.AsyncClient(timeout=settings.request_timeout_s) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, dict):
            raise RuntimeError("Unexpected orchestrator payload")
        return data


@app.post("/v1/query", response_model=AssistantResponse)
async def query_router(request: QueryRequest) -> AssistantResponse:
    if not request.message:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="message is required")
    payload = {
        "thread_id": request.thread_id or "default",
        "message": request.message,
        "meta": request.meta,
    }
    try:
        data = await _post_to_orchestrator("/v1/query", payload)
    except httpx.HTTPError as exc:  # pragma: no cover - external dependency
        raise HTTPException(status_code=_http_status_from_exc(exc), detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return AssistantResponse(**data)


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}
