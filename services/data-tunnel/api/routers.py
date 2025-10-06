import hashlib
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import desc, select

from pipeline.db import get_session, ingestions, manifests
from pipeline.lineage import update_status
from pipeline.models import IngestionStatus
from pipeline.storage import put_landing
from workers.tasks import parse_normalize

router = APIRouter()


class ReindexRequest(BaseModel):
    ingest_id: str
    tenant_id: Optional[str] = None

@router.post("/v1/ingest")
async def ingest(
    tenant_id: str = Form(...),
    source: str = Form(...),
    file: UploadFile = File(...),
    labels: Optional[List[str]] = Form(None),
    uploader: Optional[str] = Form(None),
) -> JSONResponse:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    ingest_id = str(uuid.uuid4())
    checksum = hashlib.sha256(data).hexdigest()
    labels = labels or []

    path = put_landing(tenant_id, ingest_id, data, file.filename or "upload.bin")

    with get_session() as session:
        session.execute(
            manifests.insert().values(
                ingest_id=ingest_id,
                tenant_id=tenant_id,
                source=source,
                path=path,
                checksum=checksum,
                size=len(data),
                mime=file.content_type or "application/octet-stream",
                uploader=uploader,
                labels=labels,
                created_at=datetime.utcnow(),
            )
        )

    update_status(ingest_id, tenant_id, IngestionStatus.QUEUED, stage="queued")
    parse_normalize.delay(ingest_id)

    return JSONResponse({"ingest_id": ingest_id, "status": "queued"})

@router.get("/v1/status/{ingest_id}")
async def status(ingest_id: str) -> JSONResponse:
    stmt = select(ingestions).where(ingestions.c.ingest_id == ingest_id)
    with get_session() as session:
        row = session.execute(stmt).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Ingestion not found")
    payload = {
        "ingest_id": row["ingest_id"],
        "tenant_id": row["tenant_id"],
        "status": row["status"].value if row["status"] else None,
        "stage": row["stage"],
        "started_at": row["started_at"].isoformat() if row["started_at"] else None,
        "finished_at": row["finished_at"].isoformat() if row["finished_at"] else None,
        "error": row["error"],
        "dlq_reason": row["dlq_reason"],
    }
    return JSONResponse(payload)


@router.get("/v1/ingestions")
async def list_ingestions(
    tenant_id: Optional[str] = None,
    limit: int = Query(default=25, ge=1, le=200),
) -> JSONResponse:
    stmt = (
        select(
            manifests.c.ingest_id,
            manifests.c.tenant_id,
            manifests.c.source,
            manifests.c.uploader,
            manifests.c.labels,
            manifests.c.size,
            manifests.c.mime,
            manifests.c.created_at,
            ingestions.c.status,
            ingestions.c.stage,
            ingestions.c.updated_at,
            ingestions.c.finished_at,
            ingestions.c.error,
            ingestions.c.dlq_reason,
        )
        .select_from(manifests.outerjoin(ingestions, manifests.c.ingest_id == ingestions.c.ingest_id))
        .order_by(desc(manifests.c.created_at))
        .limit(limit)
    )
    if tenant_id:
        stmt = stmt.where(manifests.c.tenant_id == tenant_id)

    with get_session() as session:
        rows = session.execute(stmt).all()

    items = []
    for row in rows:
        payload = {
            "ingest_id": row.ingest_id,
            "tenant_id": row.tenant_id,
            "source": row.source,
            "uploader": row.uploader,
            "labels": row.labels or [],
            "size": row.size,
            "mime": row.mime,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "status": row.status.value if row.status else None,
            "stage": row.stage,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
            "finished_at": row.finished_at.isoformat() if row.finished_at else None,
            "error": row.error,
            "dlq_reason": row.dlq_reason,
        }
        items.append(payload)

    return JSONResponse({"items": items, "count": len(items)})

@router.post("/v1/reindex")
async def reindex(request: ReindexRequest) -> JSONResponse:
    ingest_id = request.ingest_id

    stmt = select(manifests.c.tenant_id).where(manifests.c.ingest_id == ingest_id)
    with get_session() as session:
        row = session.execute(stmt).first()
    if not row:
        raise HTTPException(status_code=404, detail="Manifest not found for ingest")

    tenant_id = request.tenant_id or row[0]
    update_status(ingest_id, tenant_id, IngestionStatus.QUEUED, stage="reindex_queued")
    parse_normalize.delay(ingest_id)
    return JSONResponse({"ingest_id": ingest_id, "status": "queued"})
