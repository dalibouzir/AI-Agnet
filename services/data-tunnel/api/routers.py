import hashlib
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, UploadFile, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import desc, select, delete, or_

from pipeline.db import (
    get_session,
    ingestions,
    manifests,
    vectors,
    chunks,
    dq_reports,
    pii_reports,
    lineage_nodes,
    lineage_edges,
)
from pipeline.index import delete_ingest_from_index
from pipeline.lineage import update_status
from pipeline.models import IngestionStatus
from pipeline.storage import put_raw_object, put_manifest, delete_ingest_objects, generate_presigned_download
import logging

logger = logging.getLogger(__name__)

DEFAULT_OPTIONS: Dict[str, Any] = {
    "dq": {
        "language_detect": True,
        "pii": {"action": "redact", "policy": "presidio", "mask": "[REDACTED]"},
    },
    "ingest": {"continue_on_warn": True, "fail_on_pii": False},
}


def _merge_options(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    result: Dict[str, Any] = {}
    keys = set(base.keys()) | set(override.keys())
    for key in keys:
        if key in base and key in override:
            if isinstance(base[key], dict) and isinstance(override[key], dict):
                result[key] = _merge_options(base[key], override[key])
            else:
                result[key] = override[key]
        elif key in override:
            result[key] = override[key]
        else:
            result[key] = base[key]
    return result

from workers.tasks import parse_normalize

router = APIRouter()


class ReindexRequest(BaseModel):
    ingest_id: str
    tenant_id: Optional[str] = None

@router.post(
    "/v1/ingest",
    openapi_extra={
        "requestBody": {
            "content": {
                "multipart/form-data": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "tenant_id": {"type": "string"},
                            "source": {"type": "string"},
                            "doc_type": {"type": "string"},
                            "object": {"type": "string"},
                            "metadata": {"type": "string", "description": "JSON string"},
                            "options": {"type": "string", "description": "JSON string"},
                            "labels": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                            "uploader": {"type": "string"},
                            "file": {
                                "type": "string",
                                "format": "binary",
                            },
                        },
                        "required": ["tenant_id", "file"],
                    }
                }
            }
        }
    },
)
async def ingest(request: Request) -> JSONResponse:
    form = await request.form()
    logger.debug("ingest form keys=%s", list(form.keys()))

    file_field = form.get("file")
    logger.debug("ingest file field type=%s", type(file_field))
    if not hasattr(file_field, "file"):
        raise HTTPException(status_code=400, detail="file field is required")
    data = await file_field.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    tenant_id = form.get("tenant_id")
    if not tenant_id or not str(tenant_id).strip():
        raise HTTPException(status_code=400, detail="tenant_id is required")
    tenant_id = str(tenant_id).strip()

    source = str(form.get("source", "#console-upload") or "#console-upload").strip() or "#console-upload"
    doc_type = str(form.get("doc_type", "binary") or "binary").strip() or "binary"
    object_name = form.get("object")
    uploader = form.get("uploader")
    metadata_raw = form.get("metadata")
    options_raw = form.get("options")

    labels_values = []
    if hasattr(form, "getlist"):
        labels_values = [item for item in form.getlist("labels") if item]
    if not labels_values:
        single_label = form.get("labels")
        if isinstance(single_label, str):
            labels_values = [item.strip() for item in single_label.split(",") if item.strip()]

    metadata_payload: dict[str, Any] = {}
    if metadata_raw:
        try:
            parsed = json.loads(metadata_raw)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="metadata must be valid JSON") from exc
        if not isinstance(parsed, dict):
            raise HTTPException(status_code=400, detail="metadata must be a JSON object")
        metadata_payload = parsed
    options_payload: dict[str, Any] | None = None
    if options_raw:
        try:
            parsed_options = json.loads(options_raw)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="options must be valid JSON") from exc
        if not isinstance(parsed_options, dict):
            raise HTTPException(status_code=400, detail="options must be a JSON object")
        options_payload = parsed_options
    ingest_id = str(uuid.uuid4())
    checksum = hashlib.sha256(data).hexdigest()
    logger.debug("ingest labels raw=%r", labels_values)
    labels = [label for label in labels_values if label]
    if labels:
        labels = list(dict.fromkeys(labels))

    filename = file_field.filename or "upload.bin"
    object_name_str = str(object_name).strip() if isinstance(object_name, str) else None
    requested_object = (object_name_str or filename).strip() or filename
    requested_doc_type = (doc_type or "").strip() or "binary"
    s3_uri, object_storage_key = put_raw_object(
        tenant_id, ingest_id, data, requested_object
    )
    original_basename = Path(requested_object).name or Path(filename).name
    normalized_suffix = original_basename

    resolved_options = _merge_options(DEFAULT_OPTIONS, options_payload or {})
    metadata_payload["options"] = resolved_options
    metadata_payload["raw_path"] = s3_uri
    metadata_payload["raw_key"] = object_storage_key

    manifest_doc = {
        "ingest_id": ingest_id,
        "tenant_id": tenant_id,
        "source": source,
        "doc_type": requested_doc_type,
        "labels": labels,
        "uploader": str(uploader).strip() if isinstance(uploader, str) and uploader.strip() else None,
        "size": len(data),
        "mime": getattr(file_field, "content_type", None) or "application/octet-stream",
        "object": {
            "original_name": filename,
            "stored_name": requested_object,
            "raw_uri": s3_uri,
            "raw_key": object_storage_key,
        },
        "options": resolved_options,
        "metadata": metadata_payload,
        "created_at": datetime.utcnow().isoformat(),
    }
    manifest_uri, manifest_key = put_manifest(tenant_id, ingest_id, manifest_doc)
    metadata_payload["manifest_path"] = manifest_uri
    metadata_payload["manifest_key"] = manifest_key

    with get_session() as session:
        session.execute(
            manifests.insert().values(
                ingest_id=ingest_id,
                tenant_id=tenant_id,
                source=source,
                path=s3_uri,
                object_key=object_storage_key,
                object_suffix=normalized_suffix,
                original_basename=original_basename,
                doc_type=requested_doc_type,
                checksum=checksum,
                size=len(data),
                mime=getattr(file_field, "content_type", None) or "application/octet-stream",
                uploader=str(uploader).strip() if isinstance(uploader, str) and uploader.strip() else None,
                labels=labels,
                metadata=metadata_payload,
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
            manifests.c.object_key,
            manifests.c.object_suffix,
            manifests.c.original_basename,
            manifests.c.doc_type,
            manifests.c.metadata,
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
            "object_key": row.object_key,
            "object_suffix": row.object_suffix,
            "original_basename": row.original_basename,
            "doc_type": row.doc_type,
            "metadata": row.metadata or {},
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


@router.delete("/v1/ingest/{ingest_id}", status_code=200)
async def delete_ingest(ingest_id: str, tenant_id: Optional[str] = None) -> JSONResponse:
    stmt = select(manifests.c.tenant_id).where(manifests.c.ingest_id == ingest_id)
    with get_session() as session:
        manifest_row = session.execute(stmt).mappings().first()
    if not manifest_row:
        raise HTTPException(status_code=404, detail="Ingestion not found")

    resolved_tenant = tenant_id or manifest_row["tenant_id"]
    if tenant_id and tenant_id != manifest_row["tenant_id"]:
        raise HTTPException(status_code=400, detail="tenant_id mismatch")

    with get_session() as session:
        session.execute(delete(vectors).where(vectors.c.doc_id == ingest_id))
        session.execute(delete(chunks).where(chunks.c.doc_id == ingest_id))
        session.execute(delete(dq_reports).where(dq_reports.c.ingest_id == ingest_id))
        session.execute(delete(pii_reports).where(pii_reports.c.ingest_id == ingest_id))
        session.execute(
            delete(lineage_edges).where(
                or_(lineage_edges.c.parent_id == ingest_id, lineage_edges.c.child_id == ingest_id)
            )
        )
        session.execute(delete(lineage_nodes).where(lineage_nodes.c.ingest_id == ingest_id))
        session.execute(delete(manifests).where(manifests.c.ingest_id == ingest_id))
        session.execute(delete(ingestions).where(ingestions.c.ingest_id == ingest_id))

    delete_ingest_objects(resolved_tenant, ingest_id)
    delete_ingest_from_index(ingest_id, resolved_tenant)

    return JSONResponse({"ingest_id": ingest_id, "status": "deleted"})


@router.get("/v1/files/presign")
async def presign_file(tenant_id: str, object_key: str, expires_in: int = 900) -> JSONResponse:
    if not tenant_id.strip():
        raise HTTPException(status_code=400, detail="tenant_id is required")
    if not object_key.strip():
        raise HTTPException(status_code=400, detail="object_key is required")

    # Basic guard: ensure the key is within the tenant prefix.
    expected_prefix = f"{tenant_id}/landing/"
    if not object_key.startswith(expected_prefix):
        raise HTTPException(status_code=400, detail="object_key not permitted")

    try:
        url = generate_presigned_download(object_key, expires_in=expires_in)
    except Exception as exc:
        logger.error("Failed to generate presigned URL for %s: %s", object_key, exc)
        raise HTTPException(status_code=500, detail="Failed to generate download link") from exc
    return JSONResponse({"url": url, "expires_in": expires_in})
