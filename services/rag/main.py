"""RAG service for ingesting MinIO documents and querying OpenSearch."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from functools import lru_cache
from io import BytesIO
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse
from uuid import uuid4

import httpx
from fastapi import FastAPI, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from minio import Minio
from minio.error import S3Error
from pypdf import PdfReader
from pydantic import BaseModel, Field, model_validator
from prometheus_fastapi_instrumentator import Instrumentator

from settings import get_settings

settings = get_settings()

app = FastAPI(title=settings.app_name)
Instrumentator().instrument(app).expose(app)

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class ChunkRecord:
    """Internal representation for a document chunk awaiting indexing."""

    text: str
    source: str
    metadata: Dict[str, Any]


class DocumentProcessingError(Exception):
    """Raised when a document could not be processed."""


class UnsupportedDocumentError(DocumentProcessingError):
    """Raised when file extension is not supported for ingestion."""


class EmptyDocumentError(DocumentProcessingError):
    """Raised when a document does not contain extractable text."""


class IngestRequest(BaseModel):
    bucket: str
    objects: List[str] = Field(min_length=1)
    index: Optional[str] = None
    chunk_size: int = Field(default=800, gt=0)
    chunk_overlap: int = Field(default=150, ge=0)
    metadata: Optional[Dict[str, Any]] = None

    @model_validator(mode="after")
    def validate_bounds(self) -> "IngestRequest":
        if self.chunk_overlap >= self.chunk_size:
            raise ValueError("chunk_overlap must be smaller than chunk_size")
        return self


class IngestResponse(BaseModel):
    ingested: int
    index: str


class SearchRequest(BaseModel):
    query: str
    top_k: int = Field(default=5, gt=0)
    index: Optional[str] = None


class SearchHit(BaseModel):
    score: float
    text: str
    source: str
    metadata: Optional[Dict[str, Any]] = None


class SearchResponse(BaseModel):
    query_vector_dim: int
    hits: List[SearchHit] = Field(default_factory=list)


def _http_status_from_exc(exc: httpx.HTTPError) -> int:
    if isinstance(exc, httpx.HTTPStatusError):
        code = exc.response.status_code
        if 400 <= code < 600:
            return code
    return status.HTTP_502_BAD_GATEWAY


def _build_index_definition(dimension: int) -> Dict[str, Any]:
    return {
        "settings": {"index": {"knn": True}},
        "mappings": {
            "properties": {
                "text": {"type": "text"},
                "source": {"type": "keyword"},
                "chunk_id": {"type": "keyword"},
                "metadata": {"type": "object", "enabled": True},
                "embedding": {
                    "type": "knn_vector",
                    "dimension": dimension,
                    "method": {
                        "name": "hnsw",
                        "space_type": "cosinesimil",
                    },
                },
            }
        },
    }


@lru_cache(maxsize=1)
def _get_minio_client() -> Minio:
    parsed = urlparse(settings.minio_endpoint)
    secure = parsed.scheme == "https"
    endpoint = parsed.netloc or parsed.path or settings.minio_endpoint
    return Minio(
        endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=secure,
    )


async def _download_object(bucket: str, object_name: str) -> bytes:
    def _inner() -> bytes:
        client = _get_minio_client()
        response = client.get_object(bucket, object_name)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()

    try:
        return await run_in_threadpool(_inner)
    except S3Error as exc:
        raise DocumentProcessingError(f"Failed to download '{object_name}': {exc}") from exc


def _extract_text_from_pdf(payload: bytes, object_name: str) -> str:
    try:
        reader = PdfReader(BytesIO(payload))
    except Exception as exc:  # pragma: no cover - defensive guard for corrupt PDFs
        raise DocumentProcessingError(f"Unable to parse PDF '{object_name}': {exc}") from exc

    pages: List[str] = []
    for page_number, page in enumerate(reader.pages):
        try:
            extracted = page.extract_text() or ""
        except Exception as exc:  # pragma: no cover - delegated to library implementation
            logger.warning(
                "Failed to extract text from '%s' page %d: %s",
                object_name,
                page_number,
                exc,
            )
            continue
        if extracted.strip():
            pages.append(extracted)

    return "\n".join(pages)


async def _load_document_text(bucket: str, object_name: str) -> str:
    payload = await _download_object(bucket, object_name)
    suffix = object_name.lower().rsplit(".", 1)[-1] if "." in object_name else ""

    if suffix in {"txt", "md", "text"}:
        try:
            text = payload.decode("utf-8")
        except UnicodeDecodeError:
            text = payload.decode("utf-8", errors="ignore")
    elif suffix == "pdf":
        text = _extract_text_from_pdf(payload, object_name)
    else:
        raise UnsupportedDocumentError(f"Unsupported document type: '{suffix or 'unknown'}'")

    if not text.strip():
        raise EmptyDocumentError("No textual content extracted")

    return text


def _chunk_text(text: str, chunk_size: int, chunk_overlap: int) -> List[str]:
    chunks: List[str] = []
    cursor = 0
    text_length = len(text)
    step = chunk_size - chunk_overlap

    while cursor < text_length:
        end = min(cursor + chunk_size, text_length)
        chunk = text[cursor:end].strip()
        if chunk:
            chunks.append(chunk)
        cursor += step
        if step <= 0:  # pragma: no cover - guardrail for validator regressions
            break

    return chunks


async def _ensure_index(client: httpx.AsyncClient, index_name: str) -> None:
    index_url = f"{settings.opensearch_url.rstrip('/')}/{index_name}"
    try:
        response = await client.get(index_url)
        if response.status_code == status.HTTP_404_NOT_FOUND:
            create_resp = await client.put(index_url, json=_build_index_definition(settings.embedding_dimension))
            create_resp.raise_for_status()
        else:
            response.raise_for_status()
    except httpx.HTTPError as exc:  # pragma: no cover - depends on OpenSearch runtime
        raise HTTPException(
            status_code=_http_status_from_exc(exc),
            detail=f"Failed to ensure index '{index_name}': {exc}",
        ) from exc


async def _bulk_index(
    client: httpx.AsyncClient,
    index_name: str,
    documents: List[Dict[str, Any]],
) -> None:
    if not documents:
        return

    bulk_endpoint = f"{settings.opensearch_url.rstrip('/')}/_bulk"
    headers = {"Content-Type": "application/x-ndjson"}

    for start in range(0, len(documents), settings.bulk_batch_size):
        batch = documents[start : start + settings.bulk_batch_size]
        lines: List[str] = []
        for doc in batch:
            meta = {"index": {"_index": index_name, "_id": doc["chunk_id"]}}
            lines.append(json.dumps(meta))
            lines.append(json.dumps(doc))

        payload = "\n".join(lines) + "\n"

        try:
            response = await client.post(
                bulk_endpoint,
                content=payload,
                headers=headers,
                params={"refresh": "true"},
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:  # pragma: no cover - depends on backend
            raise HTTPException(
                status_code=_http_status_from_exc(exc),
                detail=f"Bulk indexing failed: {exc}",
            ) from exc

        body = response.json()
        if body.get("errors"):
            first_error = next((item for item in body.get("items", []) if item.get("index", {}).get("error")), None)
            error_reason = first_error.get("index", {}).get("error", {}).get("reason") if first_error else "Unknown error"
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"OpenSearch reported errors during bulk ingest: {error_reason}",
            )


async def _call_embedding_service(texts: List[str]) -> List[List[float]]:
    url = f"{settings.llm_url.rstrip('/')}/embed"
    try:
        async with httpx.AsyncClient(timeout=settings.llm_timeout_s) as client:
            response = await client.post(url, json={"texts": texts})
            response.raise_for_status()
    except httpx.HTTPError as exc:  # pragma: no cover - depends on LLM service
        raise HTTPException(
            status_code=_http_status_from_exc(exc),
            detail=f"Failed to obtain embeddings: {exc}",
        ) from exc

    payload = response.json()
    embeddings = payload.get("embeddings")
    if not isinstance(embeddings, list) or len(embeddings) != len(texts):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Embedding service returned an unexpected payload",
        )

    if embeddings and len(embeddings[0]) != settings.embedding_dimension:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Embedding dimension mismatch. Expected {settings.embedding_dimension}, "
                f"received {len(embeddings[0])}."
            ),
        )

    return [list(map(float, vector)) for vector in embeddings]


async def _embed_texts(texts: List[str]) -> List[List[float]]:
    embeddings: List[List[float]] = []
    for start in range(0, len(texts), settings.embedding_batch_size):
        batch = texts[start : start + settings.embedding_batch_size]
        embeddings.extend(await _call_embedding_service(batch))
    return embeddings


def _object_source(bucket: str, obj: str) -> str:
    normalized = obj.lstrip("/")
    return f"s3://{bucket}/{normalized}"


@app.post("/ingest", response_model=IngestResponse)
async def ingest(request: IngestRequest) -> IngestResponse:
    index_name = request.index or settings.rag_index
    chunk_records: List[ChunkRecord] = []
    processed_documents = 0
    skipped_documents = 0

    for object_name in request.objects:
        try:
            text = await _load_document_text(request.bucket, object_name)
        except UnsupportedDocumentError as exc:
            skipped_documents += 1
            logger.info("Skipping unsupported document '%s': %s", object_name, exc)
            continue
        except EmptyDocumentError as exc:
            skipped_documents += 1
            logger.info("Skipping empty document '%s': %s", object_name, exc)
            continue
        except DocumentProcessingError as exc:
            skipped_documents += 1
            logger.error("Failed to process document '%s': %s", object_name, exc)
            continue

        chunks = _chunk_text(text, request.chunk_size, request.chunk_overlap)
        if not chunks:
            skipped_documents += 1
            logger.info("No chunks produced for document '%s'", object_name)
            continue

        base_metadata = dict(request.metadata or {})
        base_metadata.setdefault("object", object_name)
        processed_documents += 1

        for idx, chunk in enumerate(chunks):
            chunk_metadata = dict(base_metadata)
            chunk_metadata["chunk_index"] = idx
            chunk_records.append(
                ChunkRecord(
                    text=chunk,
                    source=_object_source(request.bucket, object_name),
                    metadata=chunk_metadata,
                )
            )

    if not chunk_records:
        logger.info(
            "Ingest completed with no chunks (processed=%d, skipped=%d)",
            processed_documents,
            skipped_documents,
        )
        return IngestResponse(ingested=0, index=index_name)

    texts = [record.text for record in chunk_records]
    embeddings = await _embed_texts(texts)

    if len(embeddings) != len(chunk_records):  # pragma: no cover - defensive guard
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Mismatch between chunks and embeddings",
        )

    documents: List[Dict[str, Any]] = []
    for record, embedding in zip(chunk_records, embeddings):
        documents.append(
            {
                "text": record.text,
                "source": record.source,
                "chunk_id": str(uuid4()),
                "metadata": record.metadata,
                "embedding": embedding,
            }
        )

    async with httpx.AsyncClient(timeout=settings.request_timeout_s) as client:
        await _ensure_index(client, index_name)
        await _bulk_index(client, index_name, documents)

    logger.info(
        "Ingested %d chunks from %d documents (%d skipped) into index '%s'",
        len(documents),
        processed_documents,
        skipped_documents,
        index_name,
    )

    return IngestResponse(ingested=len(documents), index=index_name)


async def _search_chunks(index_name: str, embedding: List[float], top_k: int) -> List[SearchHit]:
    index_url = f"{settings.opensearch_url.rstrip('/')}/{index_name}/_search"
    query: Dict[str, Any] = {
        "size": top_k,
        "query": {
            "knn": {
                "embedding": {
                    "vector": embedding,
                    "k": top_k,
                }
            }
        },
    }

    async with httpx.AsyncClient(timeout=settings.request_timeout_s) as client:
        try:
            response = await client.post(index_url, json=query)
            if response.status_code == status.HTTP_404_NOT_FOUND:
                return []
            response.raise_for_status()
        except httpx.HTTPError as exc:  # pragma: no cover - depends on backend
            raise HTTPException(
                status_code=_http_status_from_exc(exc),
                detail=f"OpenSearch query failed: {exc}",
            ) from exc

    payload = response.json()
    hits_payload = payload.get("hits", {}).get("hits", [])

    hits: List[SearchHit] = []
    for item in hits_payload:
        source = item.get("_source", {})
        metadata = source.get("metadata")
        if metadata is not None and not isinstance(metadata, dict):
            metadata = None
        hits.append(
            SearchHit(
                score=float(item.get("_score", 0.0)),
                text=str(source.get("text", "")),
                source=str(source.get("source", "")),
                metadata=metadata,
            )
        )

    return hits


@app.post("/search", response_model=SearchResponse)
async def search(request: SearchRequest) -> SearchResponse:
    index_name = request.index or settings.rag_index
    embeddings = await _embed_texts([request.query])
    embedding = embeddings[0]
    hits = await _search_chunks(index_name, embedding, request.top_k)
    return SearchResponse(query_vector_dim=settings.embedding_dimension, hits=hits)


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}
