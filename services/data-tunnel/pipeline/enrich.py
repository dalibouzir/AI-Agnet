import logging
from typing import Dict

from langdetect import detect, LangDetectException

logger = logging.getLogger(__name__)


def enrich_text(text: str) -> Dict[str, object]:
    try:
        lang = detect(text) if text.strip() else "unknown"
    except LangDetectException:
        lang = "unknown"

    enrichment = {
        "lang": lang,
        "keyphrases": text.split()[:5],  # stub placeholder
        "entities": [],
        "normalized_units": {},
    }
    logger.debug("Enrichment stub produced: %s", enrichment)
    return enrichment
