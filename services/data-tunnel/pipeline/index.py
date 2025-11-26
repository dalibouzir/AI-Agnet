import logging
from typing import Iterable, List, Optional

from opensearchpy import OpenSearch
from sqlalchemy.dialects.postgresql import insert

from pipeline.db import get_session, vectors
from pipeline.embed import embedding_dimension
from settings import get_settings

logger = logging.getLogger(__name__)
_settings = get_settings()

INDEX_NAME = "rag-chunks"
TEMPLATE_NAME = "rag-chunks-template"
EMBEDDING_DIMENSION = embedding_dimension()


def _create_os_client() -> Optional[OpenSearch]:
    http_auth = None
    if _settings.opensearch_username and _settings.opensearch_password:
        http_auth = (_settings.opensearch_username, _settings.opensearch_password)
    try:
        return OpenSearch(
            hosts=[_settings.opensearch_url],
            http_auth=http_auth,
            timeout=30,
            max_retries=3,
            retry_on_timeout=True,
        )
    except Exception as exc:  # pragma: no cover - depends on OpenSearch availability
        logger.warning("OpenSearch client initialisation failed: %s", exc)
        return None


_os_client: Optional[OpenSearch] = _create_os_client()


def _get_os_client() -> Optional[OpenSearch]:
    global _os_client
    if _os_client is None:
        _os_client = _create_os_client()
    return _os_client


def ensure_index_template(client: Optional[OpenSearch] = None) -> None:
    client = client or _get_os_client()
    if not client:
        return

    template_body = {
        "index_patterns": ["rag-*", INDEX_NAME],
        "template": {
            "settings": {
                "number_of_shards": 1,
                "number_of_replicas": 0,
                "index": {
                    "knn": True,
                },
            },
            "mappings": {
                "properties": {
                    "chunk_id": {"type": "keyword"},
                    "chunk_index": {"type": "integer"},
                    "doc_id": {"type": "keyword"},
                    "tenant_id": {"type": "keyword"},
                    "text": {"type": "text"},
                    "metadata": {"type": "object", "enabled": True},
                    "embedding": {"type": "knn_vector", "dimension": EMBEDDING_DIMENSION},
                    "object": {"type": "keyword"},
                    "ingested_at": {"type": "date", "format": "date_optional_time"},
                }
            },
        },
    }

    try:
        client.indices.put_index_template(name=TEMPLATE_NAME, body=template_body)  # pragma: no cover - OpenSearch I/O
    except Exception as exc:  # pragma: no cover - OpenSearch I/O
        logger.warning("Failed to ensure OpenSearch template %s: %s", TEMPLATE_NAME, exc)


def ensure_index(index_name: str = INDEX_NAME, client: Optional[OpenSearch] = None) -> None:
    client = client or _get_os_client()
    if not client:
        return
    try:
        if not client.indices.exists(index=index_name):  # pragma: no cover - OpenSearch I/O
            ensure_index_template(client)
            client.indices.create(index=index_name, body={})
    except Exception as exc:  # pragma: no cover - OpenSearch I/O
        logger.warning("OpenSearch ensure index failed for %s: %s", index_name, exc)


def upsert_vectors(chunks: Iterable[dict], embeddings: List[List[float]], tenant_namespace: str) -> None:
    payloads = list(zip(chunks, embeddings))
    if not payloads:
        return

    with get_session() as session:
        for chunk, vector in payloads:
            stmt = insert(vectors).values(
                chunk_id=chunk["chunk_id"],
                tenant_id=tenant_namespace,
                doc_id=chunk["doc_id"],
                embedding=vector,
                metadata={
                    "section_path": chunk.get("section_path"),
                    "page_start": chunk.get("page_start"),
                    "page_end": chunk.get("page_end"),
                    "owner": chunk.get("owner"),
                    "doc_type": chunk.get("doc_type"),
                    "ingested_at": chunk.get("ingested_at"),
                    "tenant_id": chunk.get("tenant_id", tenant_namespace),
                    "metadata": chunk.get("metadata", {}),
                },
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=[vectors.c.chunk_id],
                set_={"embedding": stmt.excluded.embedding, "metadata": stmt.excluded.metadata},
            )
            session.execute(stmt)


def index_bm25(chunks: Iterable[dict], embeddings: List[List[float]], tenant_namespace: str) -> None:
    client = _get_os_client()
    if not client:
        logger.warning("OpenSearch client unavailable; skipping vector indexing for tenant=%s", tenant_namespace)
        return

    ensure_index(index_name=INDEX_NAME, client=client)

    chunk_list = list(chunks)
    if not chunk_list:
        return

    if len(chunk_list) != len(embeddings):
        logger.warning(
            "Embedding count mismatch for tenant=%s (chunks=%d embeddings=%d)",
            tenant_namespace,
            len(chunk_list),
            len(embeddings),
        )
    else:
        sample_len = len(embeddings[0]) if embeddings and isinstance(embeddings[0], list) else 0
        logger.info(
            "Indexing %d chunks for tenant=%s (embedding_dim=%d)",
            len(chunk_list),
            tenant_namespace,
            sample_len,
        )

    for chunk_index, (chunk, vector) in enumerate(zip(chunk_list, embeddings)):
        doc_id = chunk["chunk_id"]
        if vector is None:
            logger.warning("Skipping chunk %s: embedding missing", doc_id)
            continue
        if not isinstance(vector, list):
            logger.warning("Skipping chunk %s: embedding type %s", doc_id, type(vector).__name__)
            continue
        if not vector:
            logger.warning("Skipping chunk %s: embedding empty list", doc_id)
            continue
        if chunk_index == 0:
            logger.warning(
                "Sample embedding chunk=%s len=%d first=%s",
                doc_id,
                len(vector),
                vector[:3],
            )
        metadata_payload = chunk.get("metadata", {}) or {}
        object_ref = chunk.get("object") or metadata_payload.get("object")
        display_name = (
            chunk.get("source")
            or metadata_payload.get("original_basename")
            or metadata_payload.get("object_suffix")
            or metadata_payload.get("object")
            or chunk["doc_id"]
        )
        body = {
            "chunk_id": chunk["chunk_id"],
            "doc_id": chunk["doc_id"],
            "tenant_id": tenant_namespace,
            "owner": chunk.get("owner"),
            "doc_type": chunk.get("doc_type"),
            "ingested_at": chunk.get("ingested_at"),
            "text": chunk["text"],
            "source": display_name,
            "section": chunk.get("section_path"),
            "page_start": chunk.get("page_start"),
            "page_end": chunk.get("page_end"),
            "metadata": chunk.get("metadata", {}),
            "embedding": vector,
            "chunk_index": chunk.get("chunk_index", chunk_index),
            "object": object_ref,
            "citations": _build_citations(chunk["text"]),
        }
        try:
            client.index(index=INDEX_NAME, id=doc_id, body=body)
        except Exception as exc:
            logger.warning("OpenSearch index document failed: %s", exc)


def delete_ingest_from_index(ingest_id: str, tenant_id: str, client: Optional[OpenSearch] = None) -> None:
    client = client or _get_os_client()
    if not client:
        logger.warning("OpenSearch client unavailable; cannot delete ingest_id=%s", ingest_id)
        return

    query = {
        "query": {
            "bool": {
                "must": [
                    {"term": {"tenant_id": tenant_id}},
                    {"term": {"doc_id": ingest_id}},
                ]
            }
        }
    }
    try:
        client.delete_by_query(index=INDEX_NAME, body=query, refresh=True)
    except Exception as exc:
        logger.warning("OpenSearch delete_by_query failed for ingest_id=%s tenant=%s: %s", ingest_id, tenant_id, exc)
def _build_citations(text: str) -> List[dict]:
    citations: List[dict] = []
    offset = 0
    span = 200
    while offset < len(text):
        citations.append({"start": offset, "end": min(offset + span, len(text))})
        offset += span
    return citations
