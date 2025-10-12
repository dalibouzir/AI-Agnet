#!/usr/bin/env bash
set -euo pipefail

# Defaults (override via env or .env)
MINIO_ENDPOINT="${MINIO_ENDPOINT:-http://minio:9000}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-minio}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-minio123}"
BUCKET="${MINIO_BUCKET:-documents}"
WEBHOOK_URL="${DATA_TUNNEL_WEBHOOK:-http://data-tunnel:8000/webhook/minio}"

# Configure mc host and bucket
docker run --rm --network infra_default \
  -e MC_HOST_local="${MINIO_ENDPOINT#http://};${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}" \
  minio/mc mb --ignore-existing local/"$BUCKET"

# Remove any previous events, then add object-created notifications to the webhook
docker run --rm --network infra_default \
  -e MC_HOST_local="${MINIO_ENDPOINT#http://};${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}" \
  minio/mc event remove local/"$BUCKET" --event put --prefix '' || true

docker run --rm --network infra_default \
  -e MC_HOST_local="${MINIO_ENDPOINT#http://};${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}" \
  minio/mc event add local/"$BUCKET" arn:minio:sqs::WEBHOOK:webhook --event put --suffix '' --prefix ''

# Verify
docker run --rm --network infra_default \
  -e MC_HOST_local="${MINIO_ENDPOINT#http://};${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}" \
  minio/mc event list local/"$BUCKET"
