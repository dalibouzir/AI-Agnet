build:
	cd infra && docker compose build data-tunnel data-tunnel-worker

up:
	cd infra && docker compose up -d opensearch minio redis nats db data-tunnel data-tunnel-worker

green:
	curl -s -X PUT "http://localhost:9200/rag-chunks/_settings" \
	 -H 'Content-Type: application/json' -d '{"index":{"number_of_replicas":0}}' >/dev/null || true
	./scripts/setup_dashboards.sh || true
