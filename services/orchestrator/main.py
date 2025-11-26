"""FastAPI entrypoint for the LLM-only orchestrator."""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field, model_validator
from prometheus_fastapi_instrumentator import Instrumentator

from handler import handle_query
from schemas import AssistantResponse
from settings import get_settings

settings = get_settings()
app = FastAPI(title=settings.app_name)
Instrumentator().instrument(app).expose(app)


class QueryRequest(BaseModel):
    thread_id: Optional[str] = None
    message: Optional[str] = None
    meta: Dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def normalize(self) -> "QueryRequest":
        if not self.thread_id:
            self.thread_id = str(self.meta.get("thread_id") or "default")
        return self


@app.post("/v1/query", response_model=AssistantResponse)
async def orchestrate(request: QueryRequest) -> AssistantResponse:
    if not request.message:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="message is required")
    thread_id = request.thread_id or "default"
    return await handle_query(thread_id, request.message, request.meta)


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}
