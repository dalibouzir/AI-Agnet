#!/usr/bin/env bash
set -euo pipefail

ALIAS_NAME=${MINIO_ALIAS:-local}
MINIO_ENDPOINT=${MINIO_ENDPOINT:-http://localhost:9000}
MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY:-minio}
MINIO_SECRET_KEY=${MINIO_SECRET_KEY:-minio123}
MINIO_BUCKET=${MINIO_BUCKET:-documents}
WEBHOOK_NAME=${MINIO_WEBHOOK_NAME:-data-tunnel}
WEBHOOK_URL=${MINIO_WEBHOOK_URL:-http://data-tunnel:8000/webhook/minio}
WEBHOOK_PREFIX=${MINIO_WEBHOOK_PREFIX:-tenant-}
QUEUE_DIR=${MINIO_WEBHOOK_QUEUE_DIR:-/tmp/minio-webhook}

if ! command -v mc >/dev/null 2>&1; then
  echo "minio client (mc) is required but not found on PATH" >&2
  exit 1
fi

mc alias set "$ALIAS_NAME" "$MINIO_ENDPOINT" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" >/dev/null
mc mb --ignore-existing "$ALIAS_NAME/$MINIO_BUCKET" >/dev/null

mc admin config set "$ALIAS_NAME" \
  notify_webhook:"$WEBHOOK_NAME" \
  endpoint="${WEBHOOK_URL}" \
  queue_dir="${QUEUE_DIR}" \
  queue_limit="0" >/dev/null

mc admin service restart "$ALIAS_NAME" >/dev/null

mc event add "$ALIAS_NAME/$MINIO_BUCKET" \
  arn:minio:sqs:::"$WEBHOOK_NAME" \
  --event put \
  --event post \
  --event copy \
  --prefix "$WEBHOOK_PREFIX" >/dev/null

echo "MinIO webhook '$WEBHOOK_NAME' configured for bucket '$MINIO_BUCKET'"
