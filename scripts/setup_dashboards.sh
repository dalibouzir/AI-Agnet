#!/usr/bin/env bash
set -euo pipefail
KIBANA_URL="${KIBANA_URL:-http://localhost:5601}"

curl -s -H "osd-xsrf: true" -H "Content-Type: application/json" \
  -X POST "$KIBANA_URL/api/saved_objects/index-pattern/rag-chunks" \
  -d '{"attributes":{"title":"rag-chunks","timeFieldName":"ingested_at"}}' >/dev/null || true
