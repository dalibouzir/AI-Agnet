# Observability Stack

The observability toolchain ships with Prometheus for metrics collection and Grafana for visualization. Prometheus scrapes the FastAPI services (`orchestrator`, `router`, `rag`, `llm`, `sim`) and supporting exporters for Redis, Postgres, OpenSearch, plus MinIO's built-in metrics endpoint.

## Bring the stack online

```bash
cd infra
docker compose up -d --build redis-exporter postgres-exporter opensearch-exporter
docker compose restart prometheus grafana orchestrator router rag llm sim
```

- Prometheus UI: http://localhost:9090 → **Status ▸ Targets** should show every job as UP.
- Grafana: http://localhost:3000 (default credentials `admin` / `admin`). A Prometheus datasource is provisioned automatically.

## Grafana panels (PromQL)

Create a dashboard and add the following panels (all use the default Prometheus datasource):

| Panel | PromQL | Notes |
| --- | --- | --- |
| Uploads per hour | `sum by (tenant) (rate(ingestion_upload_total[1h]))` | Breaks down hourly ingestion volume by tenant. |
| Uploads per day | `sum by (tenant) (rate(ingestion_upload_total[24h]))` | Long-window view to track daily throughput. |
| Pipeline stages (stacked bars) | `sum by (stage) (rate(ingestion_stage_total[5m]))` | Visualize pipeline velocity per stage; render as stacked bars. |
| API latency p50 | `histogram_quantile(0.50, sum by (le, handler) (rate(http_server_requests_seconds_bucket[5m])))` | Display as time-series; change the legend to show the handler. |
| API latency p95 | `histogram_quantile(0.95, sum by (le, handler) (rate(http_server_requests_seconds_bucket[5m])))` | Same as p50, with 0.95 quantile. |
| Error rate (5xx) | `sum(rate(http_server_requests_seconds_count{status=~"5.."}[5m])) / sum(rate(http_server_requests_seconds_count[5m]))` | Panel format: percentage. |

> **Note:** `prometheus-fastapi-instrumentator` exports latency histograms as `http_request_duration_seconds_*`. If you prefer the legacy `http_server_requests_seconds_*` names, adjust the PromQL labels accordingly.

## Infra reference metrics

Add stat tiles or mini panels for the following metrics exposed by the exporters:

- Redis memory usage: `redis_memory_used_bytes`
- Postgres active connections: `pg_stat_activity_count`
- OpenSearch documents: `elasticsearch_indices_docs{index=~"chunks_.*"}`
- MinIO usage: explore `minio_cluster_usage_total_bytes`

## Optional community dashboards

Grafana ▸ **Dashboards ▸ Import** and use these IDs with the Prometheus datasource:

1. Redis Exporter – 763
2. PostgreSQL Overview – 9628
3. Traefik v2 – 12290
