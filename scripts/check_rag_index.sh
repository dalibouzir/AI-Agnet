#!/usr/bin/env bash
set -euo pipefail

HOST=${1:-http://localhost:9200}
INDEX=${2:-rag-chunks}

echo "Checking index '${INDEX}' on ${HOST}"
curl -sSf "${HOST}/${INDEX}/_count" | jq
