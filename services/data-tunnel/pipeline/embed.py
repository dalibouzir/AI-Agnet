import logging
import random
from pathlib import Path
from typing import Iterable, List

try:
    import yaml
except ImportError:  # pragma: no cover
    yaml = None

from settings import get_settings

logger = logging.getLogger(__name__)
_settings = get_settings()


def _load_config(path: Path) -> dict:
    if yaml:
        with path.open("r", encoding="utf-8") as handle:
            return yaml.safe_load(handle) or {}
    config: dict = {}
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if ":" in line:
                key, value = line.strip().split(":", 1)
                config[key.strip()] = value.strip()
    return config


def generate_embeddings(texts: Iterable[str]) -> List[List[float]]:
    config = _load_config(_settings.embed_config)
    dims = int(config.get("dims", 1536))
    provider = config.get("provider", _settings.embed_provider)

    embeddings: List[List[float]] = []
    for text in texts:
        if provider == "local":
            vector = [random.random() for _ in range(dims)]
        else:
            # Stub for API-based embeddings: deterministic hash-based vector for reproducibility.
            seed = sum(ord(c) for c in text) % 9973
            random.seed(seed)
            vector = [random.random() for _ in range(dims)]
        embeddings.append(vector)
    return embeddings


def embedding_dimension() -> int:
    config = _load_config(_settings.embed_config)
    return int(config.get("dims", 1536))
