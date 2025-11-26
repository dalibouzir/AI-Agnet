"""Hybrid retrieval pipeline combining BM25, dense search, and reranking."""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
import re
from typing import Any, Dict, List, Optional, Sequence, Set
from uuid import uuid4

import httpx

logger = logging.getLogger("uvicorn.error")


@dataclass
class RetrievedDocument:
    doc_id: str
    chunk_id: str
    text: str
    source: str
    metadata: Optional[Dict[str, Any]]
    score_vector: float = 0.0
    score_bm25: float = 0.0
    rerank_score: float = 0.0

    def update_vector_score(self, score: float) -> None:
        self.score_vector = max(self.score_vector, float(score))

    def update_bm25_score(self, score: float) -> None:
        self.score_bm25 = max(self.score_bm25, float(score))

    @property
    def combined_score(self) -> float:
        return max(self.score_vector, self.score_bm25)


class LocalReranker:
    """Wrapper around BAAI/bge-reranker-v2-m3 with graceful fallback."""

    def __init__(self, model_name: Optional[str]) -> None:
        self.model_name = model_name
        self._model = None
        self._load_attempted = False

    def _ensure_model(self) -> None:
        if self._load_attempted or not self.model_name:
            return

        self._load_attempted = True
        try:
            from sentence_transformers import CrossEncoder  # type: ignore
        except Exception:
            self._model = None
            return

        try:
            self._model = CrossEncoder(self.model_name, device="cpu")
        except Exception:
            self._model = None

    def score(self, query: str, texts: Sequence[str]) -> List[float]:
        if not texts:
            return []

        self._ensure_model()
        if self._model is None:
            return [0.0] * len(texts)

        pairs = [(query, text) for text in texts]
        try:
            scores = self._model.predict(pairs)
        except Exception:
            return [0.0] * len(texts)

        return [float(value) for value in scores]


class HybridRetriever:
    """Execute BM25, dense retrieval, and rerank locally before returning top chunks."""

    def __init__(self, settings: Any) -> None:
        self.settings = settings
        self.reranker = LocalReranker(getattr(settings, "reranker_model", None))
        self.index_sources: Dict[str, Optional[str]] = {}
        rag_index = settings.rag_index
        sp500_index = getattr(settings, "index_sp500", rag_index)
        phrasebank_index = getattr(settings, "index_phrasebank", rag_index)
        if sp500_index and sp500_index != rag_index:
            self.index_sources[sp500_index] = "sp500"
        if phrasebank_index and phrasebank_index != rag_index:
            self.index_sources[phrasebank_index] = "phrasebank"
        self.index_sources.setdefault(rag_index, None)

    @property
    def _vector_top_k(self) -> int:
        return getattr(self.settings, "vector_top_k", 30)

    @property
    def _final_top_k(self) -> int:
        return getattr(self.settings, "retrieval_top_k", 5)

    @property
    def _per_doc_cap(self) -> int:
        return max(1, getattr(self.settings, "retrieval_per_doc_cap", 2))

    async def retrieve(self, query: str, index_name: str, top_k: Optional[int] = None) -> List[RetrievedDocument]:
        initial_k = max(top_k or self._final_top_k, self._vector_top_k)

        async with httpx.AsyncClient(timeout=self.settings.request_timeout_s) as client:
            bm25_hits = await self._bm25_search(client, index_name, query, initial_k)
            vector_hits = await self._vector_search(client, index_name, query, initial_k)

        merged = self._merge_hits(bm25_hits, vector_hits)
        expected_source = self.index_sources.get(index_name)
        if expected_source:
            merged = [
                hit
                for hit in merged
                if hit.metadata
                and str(hit.metadata.get("source", "")).lower() == expected_source
            ]
        file_hints = self._extract_file_hints(query)
        if file_hints:
            scoped_hits = [hit for hit in merged if self._matches_file_hint(hit, file_hints)]
            if scoped_hits:
                merged = scoped_hits

        reranked = await self._rerank(query, merged)
        doc_cap = self._per_doc_cap
        capped_hits: List[RetrievedDocument] = []
        per_doc_counts: Dict[str, int] = {}
        for hit in reranked:
            doc_key = hit.doc_id or hit.source or hit.chunk_id
            count = per_doc_counts.get(doc_key, 0)
            if count >= doc_cap:
                continue
            per_doc_counts[doc_key] = count + 1
            capped_hits.append(hit)

        limit = top_k or self._final_top_k
        final_hits = capped_hits[:limit]
        clipped_query = " ".join(query.split())
        if len(clipped_query) > 120:
            clipped_query = f"{clipped_query[:117]}..."
        logger.info("Retrieved %d chunks for query='%s'", len(final_hits), clipped_query)
        return final_hits

    async def _bm25_search(
        self,
        client: httpx.AsyncClient,
        index_name: str,
        query: str,
        top_k: int,
    ) -> List[RetrievedDocument]:
        search_url = f"{self.settings.opensearch_url.rstrip('/')}/{index_name}/_search"
        body = {
            "size": top_k,
            "query": {
                "match": {
                    "text": {
                        "query": query,
                        "operator": "and",
                    }
                }
            },
        }
        try:
            response = await client.post(search_url, json=body)
            if response.status_code == 404:
                return []
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise RuntimeError(f"BM25 search failed: {exc}") from exc

        payload = response.json()
        return self._parse_hits(payload, mode="bm25")

    async def _vector_search(
        self,
        client: httpx.AsyncClient,
        index_name: str,
        query: str,
        top_k: int,
    ) -> List[RetrievedDocument]:
        embedding = await self._embed_query(query)
        body = {
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
        search_url = f"{self.settings.opensearch_url.rstrip('/')}/{index_name}/_search"
        try:
            response = await client.post(search_url, json=body)
            if response.status_code == 404:
                return []
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise RuntimeError(f"Vector search failed: {exc}") from exc

        payload = response.json()
        hits = self._parse_hits(payload, mode="vector")
        min_score = getattr(self.settings, "vector_min_score", 0.0)
        if min_score > 0.0:
            filtered = [hit for hit in hits if hit.score_vector >= min_score]
            if filtered:
                return filtered
        return hits

    @staticmethod
    def _extract_file_hints(query: str) -> Set[str]:
        """Detect explicit filename references in the user question."""
        if not query:
            return set()
        pattern = re.compile(
            r"\b([\w\-.]+\.(?:txt|pdf|csv|md|docx|pptx|xlsx|json))\b",
            flags=re.IGNORECASE,
        )
        return {match.group(1).lower() for match in pattern.finditer(query)}

    @staticmethod
    def _matches_file_hint(document: RetrievedDocument, hints: Set[str]) -> bool:
        if not document.metadata:
            return False
        candidates = [
            document.metadata.get("filename"),
            document.metadata.get("original_basename"),
            document.metadata.get("object_suffix"),
        ]
        for value in candidates:
            if value and value.lower() in hints:
                return True
        return False

    async def _embed_query(self, query: str) -> List[float]:
        url = f"{self.settings.llm_url.rstrip('/')}/embed"
        payload = {"texts": [query]}
        try:
            async with httpx.AsyncClient(timeout=self.settings.llm_timeout_s) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()
        except httpx.HTTPError as exc:
            raise RuntimeError(f"Embedding service error: {exc}") from exc

        data = response.json()
        embeddings = data.get("embeddings") or []
        if not embeddings:
            raise RuntimeError("Embedding service returned no vectors.")
        return [float(x) for x in embeddings[0]]

    def _parse_hits(
        self,
        payload: Dict[str, Any],
        mode: str,
    ) -> List[RetrievedDocument]:
        hits_payload = payload.get("hits", {}).get("hits", [])
        documents: List[RetrievedDocument] = []
        for item in hits_payload:
            source_doc = item.get("_source", {})
            metadata = source_doc.get("metadata")
            if metadata is not None and not isinstance(metadata, dict):
                metadata = None
            chunk_id = str(item.get("_id") or source_doc.get("chunk_id") or uuid4())
            doc_id = str(source_doc.get("doc_id") or "")
            if not doc_id and metadata and isinstance(metadata, dict):
                doc_id = str(metadata.get("document_id") or metadata.get("title") or "")
            if not doc_id:
                doc_id = str(source_doc.get("source", ""))
            document = RetrievedDocument(
                doc_id=doc_id,
                chunk_id=chunk_id,
                text=str(source_doc.get("text", "")),
                source=str(source_doc.get("source", "")),
                metadata=metadata,
            )
            score_value = item.get("_score", 0.0)
            if mode == "vector":
                document.update_vector_score(float(score_value))
            else:
                document.update_bm25_score(float(score_value))
            documents.append(document)
        return documents

    def _merge_hits(
        self,
        bm25_hits: List[RetrievedDocument],
        vector_hits: List[RetrievedDocument],
    ) -> List[RetrievedDocument]:
        merged: Dict[str, RetrievedDocument] = {}

        for hit in bm25_hits:
            merged[hit.chunk_id] = hit

        for hit in vector_hits:
            existing = merged.get(hit.chunk_id)
            if existing:
                existing.update_vector_score(hit.score_vector or hit.combined_score)
                existing.metadata = existing.metadata or hit.metadata
                if not existing.source and hit.source:
                    existing.source = hit.source
            else:
                merged[hit.chunk_id] = hit

        return list(merged.values())

    async def _rerank(self, query: str, hits: List[RetrievedDocument]) -> List[RetrievedDocument]:
        if not hits:
            return []

        texts = [hit.text for hit in hits]
        scores = await asyncio.to_thread(self.reranker.score, query, texts)
        for hit, score in zip(hits, scores):
            hit.rerank_score = float(score)

        hits.sort(
            key=lambda doc: (
                doc.rerank_score,
                doc.combined_score,
            ),
            reverse=True,
        )
        logger.info(
            "RAG_RETRIEVER_RESULT query=%s top=%d best_score=%.3f",
            query[:160],
            len(hits),
            hits[0].rerank_score if hits else 0.0,
        )
        return hits
