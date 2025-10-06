"""Tests for the RAG text chunker."""

from services.rag import main as rag_main


def test_chunk_text_respects_overlap() -> None:
    text = "abcdefghijklmnopqrstuvwxyz"
    chunk_size = 10
    chunk_overlap = 3

    chunks = rag_main._chunk_text(text, chunk_size, chunk_overlap)

    assert chunks[0] == text[:chunk_size]
    expected_second = text[chunk_size - chunk_overlap : chunk_size - chunk_overlap + chunk_size]
    assert chunks[1] == expected_second
    assert text.endswith(chunks[-1])
    assert all(len(chunk) <= chunk_size for chunk in chunks)
    assert len(chunks) == 4


def test_chunk_text_handles_short_documents() -> None:
    text = "short"
    chunks = rag_main._chunk_text(text, chunk_size=50, chunk_overlap=10)

    assert chunks == [text]
