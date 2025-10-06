"""Router service that forwards client requests to the orchestrator."""

from __future__ import annotations

from typing import List

import httpx
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field
from prometheus_fastapi_instrumentator import Instrumentator

from settings import get_settings

settings = get_settings()

app = FastAPI(title=settings.app_name)
Instrumentator().instrument(app).expose(app)


class AskRequest(BaseModel):
    query: str
    top_k: int = Field(default=5, gt=0)


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


@app.post("/ask", response_model=AskResponse)
async def ask(request: AskRequest) -> AskResponse:
    payload = request.model_dump(exclude_none=True)
    url = f"{settings.orchestrator_url.rstrip('/')}/ask"

    try:
        async with httpx.AsyncClient(timeout=settings.request_timeout_s) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
    except httpx.HTTPError as exc:  # pragma: no cover - external dependency
        raise HTTPException(
            status_code=_http_status_from_exc(exc),
            detail=f"Failed to reach orchestrator service: {exc}",
        ) from exc

    data = response.json()
    try:
        return AskResponse(**data)
    except Exception as exc:  # pragma: no cover - unexpected payload
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Orchestrator returned an unexpected payload: {exc}",
        ) from exc


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
