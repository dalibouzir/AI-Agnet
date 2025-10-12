#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 /absolute/path/to/file" >&2
  exit 1
fi

FILE_PATH="$1"
if [[ ! -f "$FILE_PATH" ]]; then
  echo "File not found: $FILE_PATH" >&2
  exit 1
fi

TENANT="${TENANT_ID:-tenant-demo}"
API_URL="${DATA_TUNNEL_URL:-http://localhost:8006}"
FILENAME="$(basename "$FILE_PATH")"

echo "Uploading $FILENAME for tenant $TENANT..."
INGEST_JSON="$(curl -sS -X POST "$API_URL/v1/ingest" \
  -F tenant_id="$TENANT" \
  -F source=upload \
  -F doc_type=auto \
  -F object="$FILENAME" \
  -F file=@"$FILE_PATH" \
  )"

INGEST_ID="$(echo "$INGEST_JSON" | jq -r '.ingest_id // empty')"
if [[ -z "$INGEST_ID" ]]; then
  echo "Ingest failed: $INGEST_JSON" >&2
  exit 1
fi
echo "Ingest queued: $INGEST_ID"

echo -n "Waiting for completion"
for _ in {1..60}; do
  STATUS_JSON="$(curl -sS "$API_URL/v1/status/$INGEST_ID")"
  STATUS="$(echo "$STATUS_JSON" | jq -r '.status // empty')"
  STAGE="$(echo "$STATUS_JSON" | jq -r '.stage // empty')"
  if [[ "$STATUS" == "COMPLETED" ]]; then
    echo
    echo "Ingestion completed at stage $STAGE"
    break
  fi
  if [[ "$STATUS" == "FAILED" ]]; then
    echo
    echo "Ingestion failed: $STATUS_JSON" >&2
    exit 1
  fi
  echo -n "."
  sleep 1
done

echo "Verifying OpenSearch documents..."
COUNT="$(curl -sS "http://localhost:9200/rag-chunks/_count?q=metadata.tenant_id:$TENANT" | jq -r '.count')"
echo "rag-chunks count for $TENANT: $COUNT"
