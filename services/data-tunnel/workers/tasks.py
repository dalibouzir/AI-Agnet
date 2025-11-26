import asyncio
import hashlib
import json
import logging
from typing import Any, Dict, List, Optional

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

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
from pipeline.storage import get_object, put_redacted_text
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
    if manifest_data.get("metadata") is None:
        manifest_data["metadata"] = {}
    return Manifest(**manifest_data)


def _record_chunks(tenant_id: str, doc_id: str, chunk_payloads: List[Dict[str, Any]]):
    with get_session() as session:
        for payload in chunk_payloads:
            stmt = (
                pg_insert(chunks_table)
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
                .on_conflict_do_nothing(index_elements=[chunks_table.c.chunk_id])
            )
            session.execute(stmt)


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
    options_payload = canonical.get("options") if isinstance(canonical.get("options"), dict) else {}
    try:
        logger.info("[%s] Effective options: %s", ingest_id, json.dumps(options_payload))
    except TypeError:
        logger.info("[%s] Effective options: %r", ingest_id, options_payload)

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

    options_payload = canonical.get("options") if isinstance(canonical.get("options"), dict) else {}
    dq_section = options_payload.get("dq") if isinstance(options_payload.get("dq"), dict) else {}
    ingest_section = options_payload.get("ingest") if isinstance(options_payload.get("ingest"), dict) else {}

    skip_candidate = dq_section.get("skip") if isinstance(dq_section, dict) else None
    skip_checks: List[str] = []
    if isinstance(skip_candidate, (list, tuple)):
        skip_checks = [str(item) for item in skip_candidate if item]

    pii_config = dq_section.get("pii") if isinstance(dq_section.get("pii"), dict) else {}
    pii_action = str(pii_config.get("action", "redact")).lower() or "redact"
    pii_mask = str(pii_config.get("mask", "[REDACTED]") or "[REDACTED]")
    pii_policy = str(pii_config.get("policy", "presidio") or "presidio")

    fail_on_pii = bool(ingest_section.get("fail_on_pii", False))
    continue_on_warn = bool(ingest_section.get("continue_on_warn", True))

    original_text = canonical.get("text", "")
    processed_text, pii_report = apply_pii(
        original_text,
        _settings.pii_config,
        default_action=pii_action.upper(),
        mask=pii_mask,
    )

    metadata = canonical.get("metadata") or {}
    metadata.setdefault("pii", {})

    pii_total = int(pii_report.get("_total", 0)) if isinstance(pii_report, dict) else 0
    pii_found = pii_total > 0

    metadata["pii"].update(
        {
            "found": pii_found,
            "action": pii_action,
            "mask": pii_mask,
            "policy": pii_policy,
            "total": pii_total,
            "report": {k: v for k, v in (pii_report.items() if isinstance(pii_report, dict) else []) if not k.startswith("_")},
            "raw_path": manifest.path,
        }
    )

    if pii_found and (pii_action in {"redact", "hash"}):
        canonical["text"] = processed_text
        file_name = metadata.get("filename") or metadata.get("original_basename") or "document.txt"
        redacted_uri, redacted_key = put_redacted_text(tenant_id, ingest_id, processed_text, file_name)
        metadata["pii"]["redacted_path"] = redacted_uri
        metadata["pii"]["redacted_key"] = redacted_key
    else:
        canonical["text"] = original_text if not pii_found else processed_text

    if pii_found and (pii_action in {"fail", "reject"} or fail_on_pii):
        if not stage_completed(ingest_id, stage):
            transition_failed(ingest_id, tenant_id, stage, "PII policy violation")
            _publish(
                EventType.INGESTION_FAILED,
                ingest_id,
                tenant_id,
                {"stage": stage, "pii_report": pii_report, "pii_action": pii_action},
            )
        return canonical

    dq_passed, dq_report = run_checks(
        ingest_id,
        tenant_id,
        {
            "text": canonical.get("text", ""),
            "lang": canonical.get("lang"),
            "ocr_confidence": canonical.get("ocr_confidence", 1.0),
        },
        _settings.dq_config,
        skip=skip_checks,
    )

    if not dq_passed and not stage_completed(ingest_id, stage):
        if continue_on_warn:
            metadata.setdefault("dq", {})
            metadata["dq"]["status"] = "WARN"
            metadata["dq"]["report"] = dq_report
        else:
            transition_failed(ingest_id, tenant_id, stage, "DQ checks failed")
            _publish(EventType.INGESTION_FAILED, ingest_id, tenant_id, {"stage": stage, "dq_report": dq_report})
            return canonical

    canonical.update({"pii_report": pii_report, "dq_report": dq_report, "metadata": metadata})

    try:
        with get_session() as session:
            existing_meta = session.execute(
                select(manifests.c.metadata).where(manifests.c.ingest_id == ingest_id)
            ).scalar_one_or_none()
            base_meta = existing_meta if isinstance(existing_meta, dict) else {}
            merged_meta = base_meta.copy()
            merged_meta.update(metadata)
            session.execute(
                update(manifests)
                .where(manifests.c.ingest_id == ingest_id)
                .values(metadata=merged_meta)
            )
    except Exception as exc:  # pragma: no cover
        logger.warning("Failed updating manifest metadata for %s: %s", ingest_id, exc)
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
    manifest_metadata = manifest.metadata or {}
    canonical_metadata = canonical.get("metadata", {}) or {}
    chunk_metadata_source = dict(manifest_metadata)
    chunk_metadata_source.update(canonical_metadata)
    common_meta = {
        "owner": canonical.get("owner"),
        "doc_type": canonical.get("doc_type"),
        "ingested_at": canonical.get("ingested_at"),
    }
    pages = canonical.get("pages")
    for idx, text in enumerate(chunk_texts):
        chunk_metadata = dict(chunk_metadata_source)
        for key in (
            "path",
            "raw_path",
            "object",
            "object_suffix",
            "original_basename",
            "filename",
            "document_id",
        ):
            chunk_metadata.pop(key, None)
        object_suffix = (
            manifest.original_basename
            or manifest.object_suffix
            or canonical_metadata.get("object_suffix")
            or manifest_metadata.get("object_suffix")
            or "document.txt"
        )
        s3_uri = f"s3://{_settings.s3_bucket}/{tenant_id}/landing/{ingest_id}/raw/{object_suffix}"
        chunk_metadata["path"] = s3_uri
        chunk_metadata["raw_path"] = s3_uri
        chunk_metadata["object"] = manifest.object_key
        chunk_metadata["object_suffix"] = object_suffix
        chunk_metadata["original_basename"] = manifest.original_basename or object_suffix
        chunk_metadata.setdefault("filename", manifest.original_basename or object_suffix)
        chunk_metadata.setdefault("doc_type", manifest.doc_type)
        chunk_metadata.setdefault("document_id", canonical.get("doc_id", ingest_id))
        chunk_object = manifest.object_key
        if isinstance(pages, list) and idx < len(pages):
            chunk_metadata.setdefault("page", idx)
        chunk_hash = hashlib.sha1(
            f"{canonical.get('doc_id', ingest_id)}::{idx}::{text}".encode("utf-8", errors="ignore")
        ).hexdigest()
        chunk_payloads.append(
            {
                "chunk_id": chunk_hash,
                "doc_id": canonical.get("doc_id", ingest_id),
                "text": text,
                "lang": canonical.get("lang"),
                "section_path": canonical.get("section_path"),
                "page_start": None,
                "page_end": None,
                "is_table": False,
                "tenant_id": tenant_id,
                "chunk_index": idx,
                "metadata": chunk_metadata,
                "object": chunk_object,
                **common_meta,
            }
        )

    if chunk_payloads:
        _record_chunks(tenant_id, canonical.get("doc_id", ingest_id), chunk_payloads)

    canonical.update({"chunks": chunk_payloads, "embeddings": []})
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
    embeddings = []
    if chunks:
        logger.info(
            "Generating embeddings for ingest_id=%s (%d chunks)",
            ingest_id,
            len(chunks),
        )
        embeddings = generate_embeddings([chunk.get("text", "") for chunk in chunks])
        canonical["embeddings"] = embeddings
    try:
        upsert_vectors(chunks, embeddings, tenant_id)
        index_bm25(chunks, embeddings, tenant_id)
        logger.info("Indexed %d chunks into OpenSearch", len(chunks))
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
