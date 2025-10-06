# AI Business Agent

Monorepo scaffold for an AI-assisted business operations stack combining orchestration, retrieval, simulation, and UI layers. Everything here is a runnable stub waiting for real integrations.

## Getting Started
1. Copy environment defaults: `cp .env.example .env`
2. Ensure the host kernel map limit is high enough for OpenSearch (run once per reboot): `make sysctl`
3. Launch the development stack: `make up` (uses `.env` automatically)

## Services & URLs
- Orchestrator API: http://localhost:8001
- RAG API: http://localhost:8002
- LLM API: http://localhost:8003
- Simulation API: http://localhost:8004
- Router API: http://localhost:8005
- Web UI: http://localhost:3001
- Data Tunnel API: http://localhost:8006
- Traefik Dashboard: http://localhost:80
- Grafana: http://localhost:3000
- Prometheus: http://localhost:9090
- MinIO Console: http://localhost:9001

## RAG Ingestion & Embedding Pipeline
- Uploads land in MinIO via the `data-tunnel` API, which writes a manifest to Postgres before the Celery worker picks up the job.
- The worker runs staged tasks (`parse_normalize → pii_dq → enrich → chunk_embed → index_publish`). `chunk_embed` creates the text chunks and embeddings; `index_publish` saves them to OpenSearch.
- The default PII stage uses Microsoft Presidio. When its spaCy model is missing (or the container cannot download it), the worker exits early and embeddings never reach OpenSearch—only the raw manifest remains in the `rag-chunks` index.
- Fix it by either pre-installing a spaCy model in the `data-tunnel` image (for example, add `RUN python -m spacy download en_core_web_sm` to the Dockerfile) or temporarily removing the Presidio packages in `services/data-tunnel/requirements.txt` so the PII step is skipped.
- After changing the image, rebuild and restart `data-tunnel` and `data-tunnel-worker`, then re-run the ingestion to populate vectors.

## OpenSearch Notes
- Default credentials are `admin` with the password from `OPENSEARCH_INITIAL_ADMIN_PASSWORD` (defaults to `adminadmin`; change in `.env`).
- From the host use `http://localhost:9200`; containers should use `http://opensearch:9200`.
- If OpenSearch fails to start, re-run `make sysctl` and check `docker compose logs opensearch` for credential errors.

## LLM Notes
- Set `OPENAI_API_KEY` (and optionally `OPENAI_API_BASE` / `OPENAI_COMPLETION_MODEL`) in `.env` to enable real completions via the `llm` service.
- Without an API key the orchestrator falls back to a deterministic extractive summary of the retrieved context.
- Tweak `LLM_MAX_PROMPT_CHARS` or `LLM_MAX_CONTEXT_CHUNKS` in `.env` if prompts grow too large for your chosen model.

## Next Steps
- [ ] Replace fixed responses with business logic across services
- [ ] Integrate Ollama or external LLM providers securely
- [ ] Add hybrid retrieval strategy and metrics instrumentation
- [ ] Expand data tunnel ingestion telemetry and DLQ handling

## Acceptance Criteria
- `make up` starts the compose stack without errors (even if endpoints are stubs)
- All services return `/health` → `{ "status": "ok" }`
- `apps/web` runs and shows the placeholder page
- No business logic yet; just structure, stubs, and configs
