import asyncio
from typing import Any, Dict, Optional

import pytest

from services.rag.retriever import HybridRetriever, RetrievedDocument


class DummySettings:
    opensearch_url = "http://localhost:9200"
    llm_url = "http://localhost:8000"
    llm_timeout_s = 1.0
    request_timeout_s = 1.0
    vector_top_k = 5
    retrieval_top_k = 3
    index_sp500 = "index_sp500"
    index_phrasebank = "index_phrasebank"
    rag_index = "rag-chunks"


class StubRetriever(HybridRetriever):
    def __init__(self) -> None:
        super().__init__(DummySettings())

    async def _bm25_search(
        self,
        client: Any,
        index_name: str,
        query: str,
        top_k: int,
    ) -> list[RetrievedDocument]:
        return [
            RetrievedDocument(
                doc_id="doc-1",
                chunk_id="chunk-1",
                text="Revenue for AAPL hit $394B in 2022.",
                source="memory",
                metadata={"source": "sp500", "ticker": "AAPL", "year": 2022},
            ),
            RetrievedDocument(
                doc_id="doc-2",
                chunk_id="chunk-2",
                text="Market sentiment is positive.",
                source="memory",
                metadata={"source": "phrasebank", "label": "positive"},
            ),
        ]

    async def _vector_search(
        self,
        client: Any,
        index_name: str,
        query: str,
        top_k: int,
    ) -> list[RetrievedDocument]:
        # Return no additional hits for simplicity.
        return []

    async def _rerank(self, query: str, hits: list[RetrievedDocument]) -> list[RetrievedDocument]:
        for hit in hits:
            hit.rerank_score = 0.5
        return hits


@pytest.mark.asyncio
async def test_hybrid_retriever_filters_by_metadata() -> None:
    retriever = StubRetriever()
    documents = await retriever.retrieve("Show Apple revenue in 2022", DummySettings().index_sp500, top_k=5)
    assert len(documents) == 1
    doc = documents[0]
    assert doc.metadata.get("source") == "sp500"
    assert "AAPL" in doc.metadata.get("ticker", "")
