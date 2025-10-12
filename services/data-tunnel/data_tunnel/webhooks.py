from __future__ import annotations

import hashlib
import logging
import mimetypes
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Request

from sqlalchemy import select

from pipeline.db import get_session, manifests
from pipeline.lineage import update_status
from pipeline.models import IngestionStatus
from pipeline.storage import get_object
from workers.tasks import parse_normalize

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhook", tags=["webhooks"])


def doc_type_from_mime(mime: str | None, filename: str | None) -> str:
    if mime and "/" in mime:
        subtype = mime.split("/", 1)[1].strip()
        if subtype:
            return subtype.split("+", 1)[0].lower()
    extension = Path(filename or "").suffix.lstrip(".").lower()
    return extension or "binary"


def _tenant_from_key(key: str) -> str | None:
    parts = key.split("/")
    for part in parts:
        if part.startswith("tenant-"):
            return part
    return None


def _insert_manifest(payload: Dict[str, Any]) -> None:
    with get_session() as session:
        session.execute(manifests.insert().values(**payload))


def _queue_parse(ingest_id: str, tenant_id: str) -> None:
    update_status(ingest_id, tenant_id, IngestionStatus.QUEUED, stage="queued")
    parse_normalize.delay(ingest_id)


def _manifest_exists(path: str) -> bool:
    stmt = select(manifests.c.ingest_id).where(manifests.c.path == path)
    with get_session() as session:
        return session.execute(stmt).first() is not None


@router.post("/minio")
async def minio_webhook(request: Request) -> Dict[str, Any]:
    body = await request.json()
    records: List[Dict[str, Any]] = body.get("Records") or []
    if not records:
        raise HTTPException(status_code=400, detail="No Records in payload")

    successes: List[str] = []
    failures: List[Dict[str, Any]] = []
    skipped: List[str] = []

    for record in records:
        try:
            s3_info = record.get("s3", {})
            bucket = s3_info.get("bucket", {}).get("name")
            obj = s3_info.get("object", {})
            key = obj.get("key")
            if not bucket or not key:
                raise ValueError("Missing bucket or key in record")

            if "/landing/" not in key:
                logger.info("Skipping object outside landing prefix: %s", key)
                skipped.append(key)
                continue

            tenant_id = _tenant_from_key(key)
            if not tenant_id:
                raise ValueError(f"Tenant not derivable from key: {key}")

            source = record.get("eventSource", "minio:webhook")
            uploader = record.get("userIdentity", {}).get("principalId")
            path = f"s3://{bucket}/{key}"
            if _manifest_exists(path):
                logger.info("Manifest already exists for %s; skipping", path)
                skipped.append(key)
                continue
            blob = get_object(path)
            size = obj.get("size") or len(blob)
            checksum = hashlib.sha256(blob).hexdigest()
            mime = obj.get("contentType") or mimetypes.guess_type(key)[0] or "application/octet-stream"
            original_basename = Path(key).name or "upload.bin"
            suffix_parts = key.split("/")
            object_suffix_parts = suffix_parts[6:] if len(suffix_parts) > 6 else suffix_parts[-1:]
            object_suffix = "/".join(object_suffix_parts) or original_basename
            doc_type_hint = doc_type_from_mime(mime, original_basename)

            ingest_id = str(uuid.uuid4())
            manifest_payload = {
                "ingest_id": ingest_id,
                "tenant_id": tenant_id,
                "source": source,
                "path": path,
                "object_key": key,
                "object_suffix": object_suffix,
                "original_basename": original_basename,
                "doc_type": doc_type_hint,
                "checksum": checksum,
                "size": size,
                "mime": mime,
                "uploader": uploader,
                "labels": [],
                "metadata": {},
                "created_at": datetime.utcnow(),
            }
            _insert_manifest(manifest_payload)
            _queue_parse(ingest_id, tenant_id)
            successes.append(ingest_id)
        except Exception as exc:
            logger.exception("Failed to handle MinIO record: %s", exc)
            failures.append({"error": str(exc), "record": record})

    payload = {"queued": successes, "failed": failures, "skipped": skipped, "count": len(successes)}
    if not successes and not skipped:
        raise HTTPException(status_code=400, detail=payload)
    return payload
