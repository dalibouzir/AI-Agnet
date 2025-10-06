"""Shared Prometheus metrics helpers across services."""
from typing import Iterable, Optional

from prometheus_client import Counter

DEFAULT_TENANT_LABEL = "unknown"

upload_counter = Counter(
    "ingestion_upload_total",
    "Number of uploaded files",
    labelnames=("tenant",),
)
stage_counter = Counter(
    "ingestion_stage_total",
    "Pipeline stage events",
    labelnames=("stage", "tenant"),
)


def record_upload(tenant: Optional[str]) -> None:
    """Increment the upload counter for the provided tenant."""
    upload_counter.labels(tenant=_sanitize_tenant(tenant)).inc()


def record_stage(stage: str, tenant: Optional[str]) -> None:
    """Increment the pipeline stage counter."""
    stage_counter.labels(stage=stage, tenant=_sanitize_tenant(tenant)).inc()


def record_stage_sequence(stages: Iterable[str], tenant: Optional[str]) -> None:
    """Convenience helper to record a sequence of stage transitions."""
    for stage in stages:
        record_stage(stage, tenant)


def _sanitize_tenant(tenant: Optional[str]) -> str:
    value = (tenant or DEFAULT_TENANT_LABEL).strip()
    return value or DEFAULT_TENANT_LABEL
