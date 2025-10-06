#!/usr/bin/env bash
set -euo pipefail

OPENSEARCH_URL=${OPENSEARCH_URL:-http://localhost:9200}
OPENSEARCH_USER=${OPENSEARCH_USER:-admin}
OPENSEARCH_PASSWORD=${OPENSEARCH_PASSWORD:-admin}

read -r -d '' TEMPLATE_BODY <<'JSON'
{
  "index_patterns": ["rag-*"] ,
  "template": {
    "settings": {
      "index": {
        "number_of_shards": 1,
        "number_of_replicas": 0,
        "knn": true,
        "knn.algo_param.ef_search": 512,
        "refresh_interval": "1s"
      }
    },
    "mappings": {
      "properties": {
        "chunk_id": {"type": "keyword"},
        "doc_id": {"type": "keyword"},
        "tenant_id": {"type": "keyword"},
        "owner": {"type": "keyword"},
        "doc_type": {"type": "keyword"},
        "ingested_at": {"type": "date"},
        "section": {"type": "keyword"},
        "page_start": {"type": "integer"},
        "page_end": {"type": "integer"},
        "text": {"type": "text"},
        "metadata": {"type": "flattened"},
        "embedding": {
          "type": "knn_vector",
          "dimension": 1536,
          "method": {
            "name": "hnsw",
            "engine": "faiss",
            "space_type": "cosinesimil",
            "parameters": {
              "ef_construction": 512,
              "m": 16
            }
          }
        }
      }
    }
  }
}
JSON

curl -sSf -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -H 'Content-Type: application/json' \
  -X PUT "$OPENSEARCH_URL/_index_template/rag-template" \
  -d "$TEMPLATE_BODY"

echo "rag-template index template applied"
