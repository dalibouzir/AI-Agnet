"""Monte Carlo helpers for operating income scenarios."""

from __future__ import annotations

from typing import Dict, Optional

import numpy as np


def simulate_op_income(
    revenue: float,
    op_margin: float,
    n: int = 10_000,
    rev_sigma: float = 0.06,
    m_sigma: float = 0.02,
    random_seed: Optional[int] = None,
) -> Dict[str, float]:
    """Simulate operating income outcomes and return key percentiles."""

    if random_seed is not None:
        np.random.seed(random_seed)

    revenue_draw = np.random.normal(loc=1.0, scale=rev_sigma, size=n)
    margin_draw = np.random.normal(loc=op_margin, scale=m_sigma, size=n)
    op_income = revenue * revenue_draw * margin_draw

    return {
        "p_loss": float((op_income < 0.0).mean()),
        "p5": float(np.percentile(op_income, 5)),
        "p50": float(np.percentile(op_income, 50)),
        "p95": float(np.percentile(op_income, 95)),
        "n": int(n),
    }
