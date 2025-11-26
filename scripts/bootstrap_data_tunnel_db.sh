#!/usr/bin/env bash
set -euo pipefail

# Ensure data-tunnel tables exist before starting the service.
# Usage: ./scripts/bootstrap_data_tunnel_db.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="${SCRIPT_DIR}/../infra"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required but was not found in PATH" >&2
  exit 1
fi

echo "Running metadata bootstrap via data-tunnel container..."
(cd "${COMPOSE_DIR}" && docker compose run --rm data-tunnel python -c "from pipeline.db import _metadata, _engine; _metadata.create_all(_engine)")
