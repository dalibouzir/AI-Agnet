import logging
from typing import Iterable, List

from opensearchpy import OpenSearch
from sqlalchemy.dialects.postgresql import insert

from pipeline.db import get_session, vectors
from settings import get_settings

logger = logging.getLogger(__name__)
_settings = get_settings()

_os_client = OpenSearch(hosts=[_settings.opensearch_url])


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


def index_bm25(chunks: Iterable[dict], tenant_namespace: str) -> None:
    index_name = "rag-chunks"
    if not _os_client.indices.exists(index_name):  # pragma: no cover - depends on OpenSearch
        try:
            _os_client.indices.create(index_name)
        except Exception as exc:
            logger.warning("OpenSearch create index failed: %s", exc)
            return

    for chunk in chunks:
        doc_id = chunk["chunk_id"]
        body = {
            "chunk_id": chunk["chunk_id"],
            "doc_id": chunk["doc_id"],
            "tenant_id": tenant_namespace,
            "owner": chunk.get("owner"),
            "doc_type": chunk.get("doc_type"),
            "ingested_at": chunk.get("ingested_at"),
            "text": chunk["text"],
            "section": chunk.get("section_path"),
            "page_start": chunk.get("page_start"),
            "page_end": chunk.get("page_end"),
            "metadata": chunk.get("metadata", {}),
            "citations": _build_citations(chunk["text"]),
        }
        try:
            _os_client.index(index=index_name, id=doc_id, body=body)
        except Exception as exc:
            logger.warning("OpenSearch index document failed: %s", exc)


def _build_citations(text: str) -> List[dict]:
    citations: List[dict] = []
    offset = 0
    span = 200
    while offset < len(text):
        citations.append({"start": offset, "end": min(offset + span, len(text))})
        offset += span
    return citations
