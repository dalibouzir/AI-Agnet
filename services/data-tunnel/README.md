# Data Engineering Tunnel Service

This service ingests raw documents, orchestrates normalization and enrichment stages, and persists vectors plus searchable indexes while keeping lineage, DLQ, and event signals synchronized for the AI Business Agent platform.

## API Summary
- POST /v1/ingest → {ingest_id, status}
- GET /v1/status/{ingest_id} → {status, stage, started_at, finished_at, errors?}
- POST /v1/reindex → re-embed/index a doc or tenant namespace

## Pipeline Stages
- Landing & parse_normalize: store file, detect mime, run OCR if needed
- pii_dq: redact sensitive data, run Great Expectations validations
- enrich: detect language, keyphrases, and business entities
- chunk_embed: create semantic chunks and compute embeddings
- index_publish: upsert vectors (pgvector) and BM25 documents (OpenSearch)

## Running Locally
1. Ensure required env vars are set (see `settings.py`).
2. Start the API: `uvicorn main:app --reload` from `services/data-tunnel`.
3. Launch workers: `celery -A celery_app.celery worker --loglevel=info` plus `celery -A celery_app.celery beat --loglevel=info` if scheduling.

## DLQ Behavior
Failed stages record the reason in the ingestions table, append a DLQ entry, and emit `ingestion.failed`. Re-run via Celery task or `POST /v1/reindex` once issues are resolved.

## Acceptance Criteria
- GET /health returns `{ "status": "ok" }`.
- POST /v1/ingest accepts a file and returns `{ingest_id, status:"queued"}`.
- Worker chain updates status through stages; on success vectors and BM25 index are created.
- On DQ fail, status becomes `FAILED`, DLQ reason is stored, and `ingestion.failed` event is emitted.
- All configs are externalized under `config/*.yml`.
- Idempotent re-runs do not duplicate vectors or indexes.
- Logging always includes `tenant_id`, `ingest_id`, and `stage` context.
