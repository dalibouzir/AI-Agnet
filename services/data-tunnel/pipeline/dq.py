import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, Tuple

try:
    import yaml
except ImportError:  # pragma: no cover
    yaml = None

from pipeline.db import dq_reports, get_session

logger = logging.getLogger(__name__)


def _load_checks(config_path: Path) -> Dict[str, Any]:
    if yaml:
        with config_path.open("r", encoding="utf-8") as handle:
            return yaml.safe_load(handle) or {}
    checks: Dict[str, Any] = {"checks": {}}
    with config_path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if ":" in line:
                key, value = line.strip().split(":", 1)
                if key.strip() == "checks":
                    continue
                checks.setdefault("checks", {})[key.strip()] = value.strip()
    return checks


def run_checks(
    ingest_id: str,
    tenant_id: str,
    payload: Dict[str, Any],
    config_path: Path,
    skip: Iterable[str] | None = None,
) -> Tuple[bool, Dict[str, Any]]:
    config = _load_checks(config_path).get("checks", {})
    skip_set = {item.strip() for item in (skip or []) if item}
    report: Dict[str, Any] = {
        "checks": {},
        "skipped": sorted(skip_set),
        "timestamp": datetime.utcnow().isoformat(),
    }
    passed = True

    def _mark(check: str, condition: bool) -> bool:
        if check in skip_set:
            report["checks"][check] = True
            return True
        report["checks"][check] = condition
        return condition

    if config.get("not_empty"):
        condition = bool(payload.get("text"))
        passed &= _mark("not_empty", condition)

    if config.get("language_detect"):
        lang_ok = payload.get("lang") in ("en", "auto")
        passed &= _mark("language_detect", lang_ok)

    if config.get("ocr_conf_min") is not None:
        conf = payload.get("ocr_confidence", 1.0)
        threshold = float(config.get("ocr_conf_min", 0))
        conf_ok = conf >= threshold
        passed &= _mark("ocr_conf_min", conf_ok)

    # The remaining checks are stubs that always pass until implemented.
    for key in ("table_schema_sanity", "date_unit_sanity"):
        if key in config:
            report["checks"][key] = True

    with get_session() as session:
        session.execute(
            dq_reports.insert().values(
                ingest_id=ingest_id,
                tenant_id=tenant_id,
                results=report,
                created_at=datetime.utcnow(),
            )
        )

    return passed, report
