AI Business Agent – README
==========================
Purpose
-------
The AI Business Agent pairs OpenAI's fine-tuned `ft:gpt-4o-mini-2024-07-18:esprit:ai-business-agent-v1:CaIy8Jh2` for reasoning with a local Ollama embedding stack to answer CFO-level questions with citations. It routes intent between three workflows—LLM chat, document-grounded RAG, and Monte Carlo risk simulations—so leadership teams get strategic guidance backed by their own data.

Architecture Highlights
-----------------------
1. **Data Tunnel + Worker** ingest files into MinIO, run DQ/PII checks, build semantic chunks, and write vectors into OpenSearch (`rag-chunks`).
2. **RAG Service** retrieves hybrid BM25 + vector hits, cites filenames like README.txt or Sentences_66Agree.txt, and passes curated context to the writer profile.
3. **Risk / Sim Service** runs operating-income Monte Carlo draws, returns percentile bands (P5/P50/P95) and embeds histogram metadata so narratives can reference charts.
4. **Orchestrator + Router** keep LLM routing on OpenAI but call the local embedding endpoint for chunking and query vectors, which prevents vendor lock-in while staying responsive offline.

Operating Principles
--------------------
- Every answer must mention sources when grounded, e.g., “README.txt” or “financials.csv.”
- The worker enforces `TENANT_NAMESPACE=tenant-demo`, so each tenant’s documents stay isolated in MinIO and OpenSearch.
- Local embeddings (nomic-embed-text) enable fast chunking, while OpenAI handles only generation, intent routing, and risk narration.
- Logs should confirm each decision: “Using Ollama for embeddings,” “Retrieved K chunks,” and “Selected mode: rag.”
