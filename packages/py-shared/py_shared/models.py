from typing import Optional, List

from pydantic import BaseModel


class QueryRequest(BaseModel):
    tenant_id: str
    message: str
    attachments: Optional[List[str]] = None
    preferences: Optional[dict] = None


class QueryResponse(BaseModel):
    mode: str
    confidence: float
    answer: dict
    citations: Optional[list] = None
    charts: Optional[list] = None
