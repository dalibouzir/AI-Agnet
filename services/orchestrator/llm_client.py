"""Shared HTTP client for LLM API calls."""

from __future__ import annotations

from typing import Any, Dict

import httpx

from settings import get_settings

settings = get_settings()


async def complete(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Send a completion request to the configured LLM API."""
    url = f"{settings.llm_url.rstrip('/')}/v1/complete"
    async with httpx.AsyncClient(timeout=settings.llm_request_timeout_s) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, dict):
            raise RuntimeError("LLM API returned malformed payload")
        return data
