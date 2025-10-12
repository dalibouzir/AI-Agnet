from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class IngestionStatus(str, Enum):
    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class Manifest(BaseModel):
    ingest_id: str
    tenant_id: str
    source: str
    path: str
    object_key: Optional[str] = None
    object_suffix: Optional[str] = None
    original_basename: Optional[str] = None
    doc_type: Optional[str] = None
    checksum: str
    size: int
    mime: str
    uploader: Optional[str] = None
    labels: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class LineageNode(BaseModel):
    node_id: str
    ingest_id: str
    tenant_id: str
    node_type: str
    payload_ref: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class LineageEdge(BaseModel):
    parent_id: str
    child_id: str
    relation: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Chunk(BaseModel):
    chunk_id: str
    doc_id: str
    lang: Optional[str] = None
    text: str
    tokens: int
    section_path: Optional[str] = None
    page_start: Optional[int] = None
    page_end: Optional[int] = None
    is_table: bool = False
    table_ref: Optional[str] = None


class EventType(str, Enum):
    INGESTION_STARTED = "ingestion_started"
    INGESTION_COMPLETED = "ingestion_completed"
    INGESTION_FAILED = "ingestion_failed"


class Event(BaseModel):
    event_type: EventType
    ingest_id: str
    tenant_id: str
    payload: dict
    created_at: datetime = Field(default_factory=datetime.utcnow)


class IngestionState(BaseModel):
    ingest_id: str
    tenant_id: str
    status: IngestionStatus
    stage: Optional[str] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    error: Optional[str] = None
    dlq_reason: Optional[str] = None
