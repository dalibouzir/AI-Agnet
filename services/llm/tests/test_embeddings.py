"""Unit tests for the deterministic embedding generator."""

from services.llm import main as llm_main


def test_embed_shape_and_determinism() -> None:
    texts = ["Hello world", "Another Text"]
    embeddings = llm_main._embed_batch(texts)

    assert len(embeddings) == len(texts)
    expected_dim = llm_main.settings.embedding_dimension

    for embedding in embeddings:
        assert len(embedding) == expected_dim

    single_embedding = llm_main._embed_batch([texts[0]])[0]
    assert embeddings[0] == single_embedding
