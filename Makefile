CORE_SERVICES=db redis minio opensearch nats data-tunnel llm-api rag orchestrator router sim web

build:
	cd infra && docker compose build data-tunnel data-tunnel-worker

up:
	cd infra && docker compose up -d $(CORE_SERVICES)

up-ingest:
	cd infra && docker compose --profile ingest-worker up -d data-tunnel-worker

up-observability:
	cd infra && docker compose --profile observability up -d prometheus grafana opensearch-dashboards redis-exporter postgres-exporter opensearch-exporter traefik

green:
	curl -s -X PUT "http://localhost:9200/rag-chunks/_settings" \
	 -H 'Content-Type: application/json' -d '{"index":{"number_of_replicas":0}}' >/dev/null || true
	./scripts/setup_dashboards.sh || true

snapshot-chat:
	bash scripts/snapshot_chat_transcripts.sh
