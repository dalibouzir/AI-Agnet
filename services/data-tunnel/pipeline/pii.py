import hashlib
import logging
from pathlib import Path
from typing import Dict, List, Tuple, Optional

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


def _mask_segment(text: str, start: int, end: int, action: str, mask: str) -> str:
    segment = text[start:end]
    if action == "REDACT":
        return mask
    if action == "HASH":
        return hashlib.sha256(segment.encode("utf-8")).hexdigest()
    return segment


def apply_pii(
    text: str,
    config_path: Path,
    *,
    default_action: Optional[str] = None,
    mask: str = "[REDACTED]",
) -> Tuple[str, Dict[str, int]]:
    policies = _load_policies(config_path)
    report: Dict[str, int] = {}

    if not AnalyzerEngine:
        return text, report

    try:
        import spacy

        if not spacy.util.is_package("en_core_web_lg"):
            logger.warning("Skipping PII detection: spaCy model 'en_core_web_lg' not available")
            return text, report
    except Exception:  # pragma: no cover - spaCy optional
        logger.warning("Skipping PII detection: spaCy unavailable")
        return text, report

    analyzer = AnalyzerEngine()
    results = analyzer.analyze(text=text, language="en")
    if not results:
        return text, report

    override_action = (default_action or "").strip().upper() or None
    total = 0
    # Apply transformations from end to start to keep offsets stable.
    mutable = list(text)
    for item in sorted(results, key=lambda r: r.start, reverse=True):
        entity = item.entity_type
        action = policies.get(entity, policies.get("DEFAULT", "ALLOW")).upper()
        if override_action:
            action = override_action
        report[entity] = report.get(entity, 0) + 1
        total += 1
        replacement = _mask_segment(text, item.start, item.end, action, mask)
        mutable[item.start:item.end] = list(replacement)

    report["_total"] = total
    report["_action"] = override_action or policies.get("DEFAULT", "ALLOW")

    return "".join(mutable), report
