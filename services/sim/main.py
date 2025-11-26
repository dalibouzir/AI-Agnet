"""Risk simulation microservice for operating income scenarios."""

from __future__ import annotations

import base64
import io
import json
import logging
from typing import Any, Dict, List, Optional, Tuple

import matplotlib
import numpy as np

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field, model_validator
from prometheus_fastapi_instrumentator import Instrumentator

from py_shared import currency_symbol_for, extract_country, parse_currency_amount
from settings import get_settings


def simulate_op_income(
    revenue: float,
    op_margin: float,
    n: int = 10_000,
    rev_sigma: float = 0.06,
    m_sigma: float = 0.02,
    random_seed: Optional[int] = None,
) -> Tuple[Dict[str, float], np.ndarray]:
    if random_seed is not None:
        np.random.seed(random_seed)

    revenue_draw = np.random.normal(loc=1.0, scale=rev_sigma, size=n)
    margin_draw = np.random.normal(loc=op_margin, scale=m_sigma, size=n)
    op_income = revenue * revenue_draw * margin_draw

    stats = {
        "p_loss": float((op_income < 0.0).mean()),
        "p5": float(np.percentile(op_income, 5)),
        "p50": float(np.percentile(op_income, 50)),
        "p95": float(np.percentile(op_income, 95)),
        "n": int(n),
    }
    return stats, op_income


def _currency_axis_label(currency_symbol: str, currency_code: str) -> str:
    symbol = (currency_symbol or "").strip()
    if not symbol:
        return currency_code or "USD"
    if len(symbol) > 1 and symbol.isalpha():
        return symbol
    return symbol


def _render_histogram(values: np.ndarray, currency_symbol: str, currency_code: str) -> Tuple[str, Dict[str, Any]]:
    counts, edges = np.histogram(values, bins=30)
    fig, ax = plt.subplots(figsize=(6, 4))
    ax.hist(values / 1_000_000, bins=30, color="#0D6EFD", alpha=0.8)
    ax.set_title("Operating Income Distribution")
    axis_label = _currency_axis_label(currency_symbol, currency_code)
    ax.set_xlabel(f"Operating Income ({axis_label} millions)")
    ax.set_ylabel("Frequency")
    fig.tight_layout()
    buffer = io.BytesIO()
    fig.savefig(buffer, format="png")
    plt.close(fig)
    buffer.seek(0)
    encoded = base64.b64encode(buffer.read()).decode("utf-8")
    histogram_data = {
        "counts": counts.tolist(),
        "edges": edges.tolist(),
        "unit": axis_label,
        "currency": currency_code,
        "currency_symbol": currency_symbol,
        "image_base64": encoded,
        "image_media_type": "image/png",
    }
    return encoded, histogram_data

settings = get_settings()

logger = logging.getLogger("uvicorn.error")

app = FastAPI(title=settings.app_name)
Instrumentator().instrument(app).expose(app)


class SimRequestContext(BaseModel):
    base_revenue: Optional[float] = Field(default=None, gt=0.0)
    currency: Optional[str] = None
    country: Optional[str] = None
    raw_query: Optional[str] = None

    @model_validator(mode="after")
    def normalize(self) -> "SimRequestContext":
        if self.currency:
            self.currency = self.currency.strip().upper()
        if self.country:
            self.country = self.country.strip()
        return self


class SimulationInputs(BaseModel):
    revenue: float = Field(gt=0.0)
    operating_margin: float = Field(gt=-1.0, lt=1.0)


class SimulationAssumptions(BaseModel):
    rev_sigma: float = Field(default=0.06, ge=0.0)
    margin_sigma: float = Field(default=0.02, ge=0.0)
    n: int = Field(default=10_000, gt=0)
    seed: Optional[int] = None

    @model_validator(mode="after")
    def validate_bounds(self) -> "SimulationAssumptions":
        if self.rev_sigma > 1.0:
            raise ValueError("rev_sigma must be <= 1.0")
        if self.margin_sigma > 1.0:
            raise ValueError("margin_sigma must be <= 1.0")
        return self


class SimulationRequest(BaseModel):
    ticker: str = Field(min_length=1)
    inputs: SimulationInputs
    assumptions: SimulationAssumptions = SimulationAssumptions()
    sim_request: Optional[SimRequestContext] = None

    @model_validator(mode="after")
    def normalize(self) -> "SimulationRequest":
        self.ticker = self.ticker.upper()
        return self


class SimulationStats(BaseModel):
    p_loss: float
    p5: float
    p50: float
    p95: float
    n: int


class SimulationResponse(BaseModel):
    stats: SimulationStats
    metadata: Dict[str, Any] = Field(default_factory=dict)
    charts: List[Dict[str, Any]] = Field(default_factory=list)


@app.post("/v1/run", response_model=SimulationResponse)
async def run_simulation(payload: SimulationRequest) -> SimulationResponse:
    sim_context = payload.sim_request or SimRequestContext()
    raw_query = sim_context.raw_query or ""
    parsed_details = parse_currency_amount(raw_query) if raw_query else None

    effective_revenue = sim_context.base_revenue
    if not effective_revenue and parsed_details:
        effective_revenue = parsed_details.amount
    if not effective_revenue:
        effective_revenue = payload.inputs.revenue

    currency_code = sim_context.currency
    currency_symbol = None
    if currency_code:
        currency_symbol = currency_symbol_for(currency_code)
    elif parsed_details:
        currency_code = parsed_details.currency_code
        currency_symbol = parsed_details.currency_symbol
    else:
        currency_code = "EUR"
        currency_symbol = currency_symbol_for(currency_code)

    detected_country = sim_context.country or (extract_country(raw_query) if raw_query else None) or "N/A"

    try:
        stats, samples = simulate_op_income(
            revenue=effective_revenue,
            op_margin=payload.inputs.operating_margin,
            n=payload.assumptions.n,
            rev_sigma=payload.assumptions.rev_sigma,
            m_sigma=payload.assumptions.margin_sigma,
            random_seed=payload.assumptions.seed,
        )
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    stats_model = SimulationStats(**stats)
    parsed_snapshot = parsed_details.as_dict() if parsed_details else None
    used_snapshot = {
        "revenue": effective_revenue,
        "currency": currency_code,
        "operating_margin": payload.inputs.operating_margin,
        "rev_sigma": payload.assumptions.rev_sigma,
    }
    trace_payload = {
        "parsed_from_text": parsed_snapshot,
        "used_for_simulation": used_snapshot,
    }
    try:
        logger.info("RISK_SIM_TRACE\t%s", json.dumps(trace_payload))
    except Exception:  # pragma: no cover - best effort logging
        logger.debug("Failed to log risk parser trace", exc_info=True)

    metadata = {
        "ticker": payload.ticker,
        "revenue": effective_revenue,
        "operating_margin": payload.inputs.operating_margin,
        "rev_sigma": payload.assumptions.rev_sigma,
        "margin_sigma": payload.assumptions.margin_sigma,
        "n": payload.assumptions.n,
        "seed": payload.assumptions.seed,
        "currency": currency_code,
        "currency_symbol": currency_symbol,
        "country": detected_country,
        "parsed_from_text": parsed_snapshot,
        "used_for_simulation": used_snapshot,
        "sim_request": sim_context.model_dump(exclude_none=True),
    }
    _, histogram_data = _render_histogram(samples, currency_symbol, currency_code)
    chart_payload = {
        "type": "histogram",
        "title": "Operating Income Distribution",
        "data": histogram_data,
    }
    return SimulationResponse(stats=stats_model, metadata=metadata, charts=[chart_payload])


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}
