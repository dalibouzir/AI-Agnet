import asyncio
import json
import logging
from typing import Any, Dict, Optional

from nats.aio.client import Client as NATS

from pipeline.models import EventType
from settings import get_settings

logger = logging.getLogger(__name__)
_settings = get_settings()

_nats: Optional[NATS] = None
_lock = asyncio.Lock()


def _topic(event_type: EventType) -> str:
    mapping = {
        EventType.INGESTION_STARTED: "ingestion.started",
        EventType.INGESTION_COMPLETED: "ingestion.completed",
        EventType.INGESTION_FAILED: "ingestion.failed",
    }
    return mapping[event_type]


async def _ensure_connection() -> Optional[NATS]:
    global _nats
    if _nats and _nats.is_connected:
        return _nats
    async with _lock:
        if _nats and _nats.is_connected:
            return _nats
        client = NATS()
        try:
            await client.connect(_settings.nats_url)
        except Exception as exc:  # fallback stub
            logger.warning("NATS unavailable, falling back to log sink: %s", exc)
            _nats = None
            return None
        _nats = client
        return client


async def publish(event_type: EventType, payload: Dict[str, Any], ingest_id: str, tenant_id: str) -> None:
    topic = _topic(event_type)
    message = {"ingest_id": ingest_id, "tenant_id": tenant_id, "payload": payload}
    client = await _ensure_connection()
    if client is None:
        logger.info("[EVENT-FALLBACK] topic=%s data=%s", topic, json.dumps(message))
        return
    await client.publish(topic, json.dumps(message).encode("utf-8"))
