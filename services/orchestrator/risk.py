"""Risk (Monte Carlo) helpers for the orchestrator."""

from __future__ import annotations

import logging
import os
import re
from typing import Any, Dict, Optional

import httpx

from settings import get_settings

settings = get_settings()
logger = logging.getLogger("uvicorn.error")
_CACHE: Dict[str, Dict[str, Any]] = {}
_DATA_VERSION = os.getenv("RISK_DATA_VERSION", "1.0")
_CLEAN_NUMERIC = re.compile(r"[^0-9eE\.\-+]")


def _parse_number(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return None
        cleaned = cleaned.replace(",", "")
        cleaned = _CLEAN_NUMERIC.sub("", cleaned)
        if not cleaned or cleaned in {"+", "-", ".", "+.", "-."}:
            return None
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


def _coerce_float(value: Any, default: float, field: str) -> float:
    parsed = _parse_number(value)
    if parsed is None:
        if value not in (None, ""):
            logger.warning("Invalid %s=%r; falling back to %s", field, value, default)
        return float(default)
    return float(parsed)


def _coerce_int(value: Any, default: int, field: str) -> int:
    parsed = _parse_number(value)
    if parsed is None:
        if value not in (None, ""):
            logger.warning("Invalid %s=%r; falling back to %s", field, value, default)
        return int(default)
    try:
        return int(parsed)
    except (TypeError, ValueError):
        logger.warning("Invalid int %s=%r; falling back to %s", field, value, default)
        return int(default)


def current_data_version() -> str:
    return _DATA_VERSION


def read(signature: str) -> Optional[Dict[str, Any]]:
    return _CACHE.get(signature)


def store(signature: str, payload: Dict[str, Any]) -> None:
    _CACHE[signature] = payload


def bound_trials(spec: Dict[str, Any], max_trials: int) -> Dict[str, Any]:
    copy = dict(spec)
    trials = _coerce_int(copy.get("trials"), max_trials, "trials")
    copy["trials"] = min(max_trials, max(100, trials))
    return copy


async def run(spec: Dict[str, Any]) -> Dict[str, Any]:
    variables = spec.get("variables") or {}
    base_revenue = _coerce_float(variables.get("revenue"), settings.risk_default_revenue, "revenue")
    operating_margin = _coerce_float(variables.get("operatingMargin"), settings.risk_default_margin, "operatingMargin")
    rev_sigma = _coerce_float(variables.get("revSigma"), settings.risk_default_rev_sigma, "revSigma")
    margin_sigma = _coerce_float(variables.get("marginSigma"), settings.risk_default_margin_sigma, "marginSigma")
    trials = _coerce_int(spec.get("trials"), settings.risk_trials, "trials")

    payload = {
        "ticker": variables.get("ticker") or "N/A",
        "inputs": {
            "revenue": base_revenue,
            "operating_margin": operating_margin,
        },
        "assumptions": {
            "rev_sigma": rev_sigma,
            "margin_sigma": margin_sigma,
            "n": trials,
        },
        "sim_request": {
            "base_revenue": base_revenue,
            "currency": variables.get("currency") or "USD",
            "raw_query": spec.get("scenarioNotes") or "",
        },
    }

    url = f"{settings.sim_url.rstrip('/')}/v1/run"
    try:
        async with httpx.AsyncClient(timeout=settings.request_timeout_s) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPError as exc:
        status_code = getattr(exc.response, "status_code", None)
        logger.error("Simulation HTTP error (status=%s): %s", status_code, exc)
        return {"error": "simulation_http_error", "detail": str(exc), "status_code": status_code}
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Simulation call failed: %s", exc)
        return {"error": "simulation_failed", "detail": str(exc)}

    if not isinstance(data, dict):
        logger.error("Simulation service returned malformed payload: %r", data)
        return {"error": "simulation_invalid_payload"}
    return data
