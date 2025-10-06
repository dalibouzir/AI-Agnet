import pytest


@pytest.mark.skip(reason="Integration tests require running the full pipeline stack.")
def test_ingest_flow_happy_path():
    """Upload sample document and expect status to transition to COMPLETED."""
    raise NotImplementedError


@pytest.mark.skip(reason="Integration tests require running the full pipeline stack.")
def test_ingest_flow_failure_path():
    """Force data quality failure and expect FAILED status with DLQ entry."""
    raise NotImplementedError
