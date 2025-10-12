#!/usr/bin/env bash
set -euo pipefail

OPENSEARCH_URL="${OPENSEARCH_URL:-http://localhost:9200}"
INDEX_TEMPLATE_NAME="rag-template"

curl -sS -X PUT "$OPENSEARCH_URL/_template/$INDEX_TEMPLATE_NAME" \
  -H 'Content-Type: application/json' -d '{
  "index_patterns": ["rag-chunks*"],
  "settings": {
    "index": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "knn": true
    }
  },
  "mappings": {
    "dynamic": "true",
    "properties": {
      "text":        { "type": "text", "analyzer": "standard" },
      "text_raw":    { "type": "keyword", "ignore_above": 32766 },
      "metadata":    { "type": "object", "dynamic": true },
      "embedding":   { "type": "knn_vector", "dimension": 1536, "method": {"name": "hnsw", "space_type": "cosinesimil"} }
    }
  }
}'
echo
echo "Template $INDEX_TEMPLATE_NAME installed."
