import hashlib
import logging
from pathlib import Path
from typing import Dict, List, Tuple

try:
    import yaml
except ImportError:  # pragma: no cover - fallback for minimal envs
    yaml = None

try:
    from presidio_analyzer import AnalyzerEngine
except ImportError:  # pragma: no cover
    AnalyzerEngine = None

logger = logging.getLogger(__name__)


def _load_policies(path: Path) -> Dict[str, str]:
    if yaml:
        with path.open("r", encoding="utf-8") as handle:
            data = yaml.safe_load(handle) or {}
    else:
        data = {}
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                if ":" in line:
                    key, value = line.strip().split(":", 1)
                    if key.strip() and value.strip():
                        data.setdefault("policies", {})[key.strip()] = value.strip()
    return data.get("policies", {})


def _mask_segment(text: str, start: int, end: int, action: str) -> str:
    segment = text[start:end]
    if action == "REDACT":
        return "[REDACTED]"
    if action == "HASH":
        return hashlib.sha256(segment.encode("utf-8")).hexdigest()
    return segment


def apply_pii(text: str, config_path: Path) -> Tuple[str, Dict[str, int]]:
    policies = _load_policies(config_path)
    report: Dict[str, int] = {}

    if not AnalyzerEngine:
        return text, report

    analyzer = AnalyzerEngine()
    results = analyzer.analyze(text=text, language="en")
    if not results:
        return text, report

    # Apply transformations from end to start to keep offsets stable.
    mutable = list(text)
    for item in sorted(results, key=lambda r: r.start, reverse=True):
        entity = item.entity_type
        action = policies.get(entity, policies.get("DEFAULT", "ALLOW")).upper()
        report[entity] = report.get(entity, 0) + 1
        replacement = _mask_segment(text, item.start, item.end, action)
        mutable[item.start:item.end] = list(replacement)

    return "".join(mutable), report
