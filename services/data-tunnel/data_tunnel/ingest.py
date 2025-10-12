from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

try:
    import magic
except ImportError:  # pragma: no cover - libmagic optional
    magic = None
from langdetect import LangDetectException, detect

from pipeline.models import Manifest
from settings import get_settings

from .text_extract import TextExtractionResult, extract_text

logger = logging.getLogger(__name__)
_settings = get_settings()

if magic is None:
    _MAGIC = None
else:
    try:
        _MAGIC = magic.Magic(mime=True)
    except Exception:  # pragma: no cover - libmagic missing at runtime
        _MAGIC = None

DEFAULT_PARSER_ALLOWLIST = {
    "pdf",
    "docx",
    "txt",
    "csv",
    "pptx",
    "xlsx",
    "image",
    "json",
    "unstructured",
    "binary",
}

CHUNKING_PRESETS: Dict[str, Dict[str, int]] = {
    "default": {"max_tokens": 600, "overlap_tokens": 80},
    "pdf": {"max_tokens": 650, "overlap_tokens": 90},
    "docx": {"max_tokens": 650, "overlap_tokens": 90},
    "txt": {"max_tokens": 600, "overlap_tokens": 80},
    "csv": {"max_tokens": 400, "overlap_tokens": 40},
    "pptx": {"max_tokens": 520, "overlap_tokens": 60},
    "xlsx": {"max_tokens": 450, "overlap_tokens": 50},
    "image": {"max_tokens": 600, "overlap_tokens": 80},
}


def _detect_mime(blob: bytes, manifest_mime: str | None = None) -> str:
    if manifest_mime and manifest_mime != "application/octet-stream":
        return manifest_mime
    if _MAGIC:
        try:
            return _MAGIC.from_buffer(blob)
        except Exception as exc:  # pragma: no cover - libmagic edge cases
            logger.debug("libmagic detection failed: %s", exc)
    return manifest_mime or "application/octet-stream"


def _allowed_parser(doc_type: str) -> bool:
    configured = {doc.strip() for doc in _settings.parsers if doc and doc.strip()}
    if not configured:
        return True
    allowlist = configured or DEFAULT_PARSER_ALLOWLIST
    return doc_type in allowlist or doc_type in DEFAULT_PARSER_ALLOWLIST


def _chunk_strategy_for(doc_type: str) -> Dict[str, int]:
    strategy = CHUNKING_PRESETS.get(doc_type)
    if not strategy:
        strategy = CHUNKING_PRESETS["default"].copy()
    return {key: int(value) for key, value in strategy.items()}


def _detect_language(text: str) -> Optional[str]:
    cleanup = text.strip()
    if len(cleanup) < 20:
        return None
    sample = cleanup[:4000]
    try:
        return detect(sample)
    except LangDetectException:
        return None


def _extract_filename(manifest: Manifest) -> str:
    path = manifest.path or ""
    if not path:
        return "upload.bin"
    return path.rstrip("/").split("/")[-1] or "upload.bin"


def ingest_manifest(manifest: Manifest, blob: bytes) -> Dict[str, Any]:
    """Perform parsing, metadata enrichment, and chunking hints for a manifest."""

    mime = _detect_mime(blob, manifest.mime)
    filename = _extract_filename(manifest)

    extraction: TextExtractionResult = extract_text(
        blob,
        filename,
        mime,
        enable_ocr=_settings.enable_ocr,
        ocr_languages=_settings.ocr_langs,
    )

    requested_doc_type = manifest.doc_type
    doc_type = extraction.doc_type or requested_doc_type or "binary"
    if not _allowed_parser(doc_type):
        logger.info("Doc type %s not enabled via PARSERS; storing raw text only", doc_type)

    language = _detect_language(extraction.text)
    ingested_at = datetime.utcnow().isoformat()

    user_metadata_raw = manifest.metadata if isinstance(manifest.metadata, dict) else {}
    user_metadata: Dict[str, Any] = dict(user_metadata_raw)
    options_candidate = user_metadata.pop("options", None)
    options_config = {}
    if isinstance(options_candidate, dict):
        options_config = dict(options_candidate)

    metadata: Dict[str, Any] = {
        "tenant_id": manifest.tenant_id,
        "source": manifest.source,
        "path": manifest.path,
        "raw_path": manifest.path,
        "size": manifest.size,
        "labels": manifest.labels,
        "filename": manifest.original_basename or filename,
        "mime": mime,
        "doc_type": doc_type,
        "uploader": manifest.uploader,
        "checksum": manifest.checksum,
        "ingested_at": ingested_at,
    }

    if extraction.pages:
        metadata["page_count"] = len(extraction.pages)
    if extraction.tables:
        metadata["tables_detected"] = len(extraction.tables)
    if extraction.ocr_applied:
        metadata["ocr"] = {
            "enabled": True,
            "confidence": extraction.ocr_confidence,
            "languages": _settings.ocr_langs,
        }

    if manifest.object_key:
        metadata["object"] = manifest.object_key
    if manifest.object_suffix:
        metadata["object_suffix"] = manifest.object_suffix
    if manifest.original_basename:
        metadata["original_basename"] = manifest.original_basename

    if requested_doc_type and requested_doc_type != doc_type:
        metadata["doc_type_requested"] = requested_doc_type

    if user_metadata:
        metadata["user_metadata"] = user_metadata
    if options_config:
        metadata["options"] = options_config

    chunk_strategy = _chunk_strategy_for(doc_type)

    canonical: Dict[str, Any] = {
        "text": extraction.text,
        "mime": mime,
        "tenant_id": manifest.tenant_id,
        "doc_id": manifest.ingest_id,
        "ingest_id": manifest.ingest_id,
        "lang": language,
        "doc_type": doc_type,
        "owner": manifest.uploader or "system",
        "ingested_at": ingested_at,
        "chunk_strategy": chunk_strategy,
        "metadata": metadata,
        "options": options_config,
        "pages": extraction.pages,
        "tables": extraction.tables,
        "ocr_applied": extraction.ocr_applied,
        "ocr_confidence": extraction.ocr_confidence,
    }
    return canonical
