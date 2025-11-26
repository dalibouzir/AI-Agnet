#!/usr/bin/env bash
set -euo pipefail

SRC_PATH="${CHAT_LOG_PATH:-apps/web/logs/chat-transcripts.jsonl}"
DEST_DIR="${CHAT_SNAPSHOT_DIR:-datasets/chat}"
TIMESTAMP="$(date +%Y-%m-%d)"

if [[ ! -f "$SRC_PATH" ]]; then
  echo "[snapshot] No transcript file found at ${SRC_PATH}. Skipping snapshot." >&2
  exit 0
fi

mkdir -p "$DEST_DIR"
DEST_PATH="${DEST_DIR}/chat-${TIMESTAMP}.jsonl"

cp "$SRC_PATH" "$DEST_PATH"

echo "[snapshot] Wrote ${DEST_PATH}"

