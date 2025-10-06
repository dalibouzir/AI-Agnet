import asyncio
import logging
import uuid
from typing import Any, Dict, List, Optional

from sqlalchemy import select

from celery_app import celery
from pipeline import enrich as enrich_module
from pipeline.chunk import load_strategy, semantic_chunks
from pipeline.db import chunks as chunks_table
from pipeline.db import get_session, manifests
from pipeline.dq import run_checks
from pipeline.embed import generate_embeddings
from pipeline.events import publish
from pipeline.index import index_bm25, upsert_vectors
from pipeline.lineage import (
    mark_stage_complete,
    stage_completed,
    transition_completed,
    transition_failed,
    transition_processing,
)
from pipeline.models import EventType, Manifest
from pipeline.pii import apply_pii
from data_tunnel.ingest import ingest_manifest
from pipeline.storage import get_object
from settings import get_settings

logger = logging.getLogger(__name__)
_settings = get_settings()


def _get_manifest(ingest_id: str) -> Optional[Manifest]:
    stmt = select(manifests).where(manifests.c.ingest_id == ingest_id)
    with get_session() as session:
        row = session.execute(stmt).mappings().first()
    if not row:
        return None
    manifest_data = dict(row)
    if manifest_data.get("labels") is None:
        manifest_data["labels"] = []
    return Manifest(**manifest_data)


def _record_chunks(tenant_id: str, doc_id: str, chunk_payloads: List[Dict[str, Any]]):
    with get_session() as session:
        for payload in chunk_payloads:
            session.execute(
                chunks_table.insert()
                .values(
                    chunk_id=payload["chunk_id"],
                    doc_id=doc_id,
                    tenant_id=tenant_id,
                    text=payload["text"],
                    lang=payload.get("lang"),
                    tokens=len(payload["text"].split()),
                    section_path=payload.get("section_path"),
                    page_start=payload.get("page_start"),
                    page_end=payload.get("page_end"),
                    is_table=int(payload.get("is_table", False)),
                    table_ref=payload.get("table_ref"),
                )
                .on_conflict_do_nothing()
            )


def _publish(event: EventType, ingest_id: str, tenant_id: str, payload: dict):
    try:
        asyncio.run(publish(event, payload, ingest_id, tenant_id))
    except RuntimeError:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(publish(event, payload, ingest_id, tenant_id))
        else:
            loop.run_until_complete(publish(event, payload, ingest_id, tenant_id))


@celery.task(name="workers.tasks.parse_normalize")
def parse_normalize(ingest_id: str) -> Dict[str, Any]:
    manifest = _get_manifest(ingest_id)
    if not manifest:
        logger.error("Manifest missing for ingest_id=%s", ingest_id)
        return {"ingest_id": ingest_id}

    tenant_id = manifest.tenant_id
    stage = "parse_normalize"
    transition_processing(ingest_id, tenant_id, stage)
    _publish(EventType.INGESTION_STARTED, ingest_id, tenant_id, {"stage": stage})

    content = b""
    if manifest.path:
        try:
            content = get_object(manifest.path)
        except Exception as exc:
            logger.warning("Landing object fetch failed: %s", exc)
    canonical = ingest_manifest(manifest, content)

    mark_stage_complete(ingest_id, tenant_id, stage)
    celery.signature("workers.tasks.pii_dq", args=(ingest_id, canonical)).delay()
    return canonical


@celery.task(name="workers.tasks.pii_dq")
def pii_dq(ingest_id: str, canonical: Dict[str, Any] | None = None) -> Dict[str, Any]:
    manifest = _get_manifest(ingest_id)
    if not manifest:
        return {"ingest_id": ingest_id}
    tenant_id = manifest.tenant_id
    stage = "pii_dq"
    transition_processing(ingest_id, tenant_id, stage)

    canonical = canonical or {"text": ""}

    redacted, pii_report = apply_pii(canonical.get("text", ""), _settings.pii_config)
    dq_passed, dq_report = run_checks(
        ingest_id,
        tenant_id,
        {
            "text": redacted,
            "lang": canonical.get("lang"),
            "ocr_confidence": canonical.get("ocr_confidence", 1.0),
        },
        _settings.dq_config,
    )

    if not dq_passed and not stage_completed(ingest_id, stage):
        transition_failed(ingest_id, tenant_id, stage, "DQ checks failed")
        _publish(EventType.INGESTION_FAILED, ingest_id, tenant_id, {"stage": stage, "dq_report": dq_report})
        return canonical

    canonical.update({"text": redacted, "pii_report": pii_report, "dq_report": dq_report})
    mark_stage_complete(ingest_id, tenant_id, stage)
    celery.signature("workers.tasks.enrich_stage", args=(ingest_id, canonical)).delay()
    return canonical


@celery.task(name="workers.tasks.enrich_stage")
def enrich_stage(ingest_id: str, canonical: Dict[str, Any]) -> Dict[str, Any]:
    manifest = _get_manifest(ingest_id)
    if not manifest:
        return canonical
    tenant_id = manifest.tenant_id
    stage = "enrich"
    transition_processing(ingest_id, tenant_id, stage)

    enrichment = enrich_module.enrich_text(canonical.get("text", ""))
    canonical.update(enrichment)
    mark_stage_complete(ingest_id, tenant_id, stage)
    celery.signature("workers.tasks.chunk_embed", args=(ingest_id, canonical)).delay()
    return canonical


@celery.task(name="workers.tasks.chunk_embed")
def chunk_embed(ingest_id: str, canonical: Dict[str, Any]) -> Dict[str, Any]:
    manifest = _get_manifest(ingest_id)
    if not manifest:
        return canonical
    tenant_id = manifest.tenant_id
    stage = "chunk_embed"
    transition_processing(ingest_id, tenant_id, stage)

    strategy = load_strategy(_settings.chunk_config)
    override = canonical.get("chunk_strategy")
    if isinstance(override, dict) and override:
        strategy.update({k: override[k] for k in override if k in {"max_tokens", "overlap_tokens"}})
    chunk_texts = semantic_chunks(canonical.get("text", ""), strategy)
    chunk_payloads: List[Dict[str, Any]] = []
    common_meta = {
        "owner": canonical.get("owner"),
        "doc_type": canonical.get("doc_type"),
        "ingested_at": canonical.get("ingested_at"),
        "metadata": canonical.get("metadata", {}),
    }
    for text in chunk_texts:
        chunk_payloads.append(
            {
                "chunk_id": str(uuid.uuid4()),
                "doc_id": canonical.get("doc_id", ingest_id),
                "text": text,
                "lang": canonical.get("lang"),
                "section_path": canonical.get("section_path"),
                "page_start": None,
                "page_end": None,
                "is_table": False,
                "tenant_id": tenant_id,
                **common_meta,
            }
        )

    if chunk_payloads:
        _record_chunks(tenant_id, canonical.get("doc_id", ingest_id), chunk_payloads)
        embeddings = generate_embeddings([c["text"] for c in chunk_payloads])
    else:
        embeddings = []

    canonical.update({"chunks": chunk_payloads, "embeddings": embeddings})
    mark_stage_complete(ingest_id, tenant_id, stage)
    celery.signature("workers.tasks.index_publish", args=(ingest_id, canonical)).delay()
    return canonical


@celery.task(name="workers.tasks.index_publish")
def index_publish(ingest_id: str, canonical: Dict[str, Any]) -> Dict[str, Any]:
    manifest = _get_manifest(ingest_id)
    if not manifest:
        return canonical
    tenant_id = manifest.tenant_id
    stage = "index_publish"
    transition_processing(ingest_id, tenant_id, stage)

    chunks = canonical.get("chunks", [])
    embeddings = canonical.get("embeddings", [])
    try:
        upsert_vectors(chunks, embeddings, tenant_id)
        index_bm25(chunks, tenant_id)
    except Exception as exc:
        if not stage_completed(ingest_id, stage):
            transition_failed(ingest_id, tenant_id, stage, str(exc))
            _publish(EventType.INGESTION_FAILED, ingest_id, tenant_id, {"stage": stage, "error": str(exc)})
        return canonical

    mark_stage_complete(ingest_id, tenant_id, stage)
    transition_completed(ingest_id, tenant_id)
    _publish(EventType.INGESTION_COMPLETED, ingest_id, tenant_id, {"stage": stage})
    return canonical


@celery.task(name="workers.tasks.reindex_stale_documents")
def reindex_stale_documents() -> int:
    logger.info("Reindex stale documents stub executed")
    return 0
