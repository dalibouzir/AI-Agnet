import logging
import random
from pathlib import Path
from typing import Iterable, List

try:
    import yaml
except ImportError:  # pragma: no cover
    yaml = None

import requests

from settings import get_settings

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
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


def _generate_local(dims: int, texts: List[str]) -> List[List[float]]:
    embeddings: List[List[float]] = []
    for text in texts:
        seed = sum(ord(c) for c in text) % 9973
        random.seed(seed)
        vector = [random.random() for _ in range(dims)]
        embeddings.append(vector)
    return embeddings


def _generate_ollama(config: dict, texts: List[str], batch_size: int) -> List[List[float]]:
    host = config.get("host") or _settings.ollama_host
    url = config.get("url") or f"{host.rstrip('/')}/api/embeddings"
    model = config.get("ollama_model") or config.get("model") or _settings.embed_model
    timeout = float(config.get("timeout", 30))

    results: List[List[float]] = []
    for batch in _batched(texts, max(1, batch_size)):
        logger.info("Sending %d texts to Ollama batch request", len(batch))
        for text in batch:
            payload = {
                "model": model,
                "prompt": text,
            }
        try:
            response = requests.post(url, json=payload, timeout=timeout)
            response.raise_for_status()
        except requests.RequestException as exc:
            logger.error("Ollama embedding request failed: %s", exc)
            raise RuntimeError(f"Ollama embedding request failed: {exc}") from exc

        data = response.json()
        embedding = data.get("embedding")
        if isinstance(embedding, list) and embedding:
            results.append([float(value) for value in embedding])
            continue

        multi = data.get("embeddings")
        if isinstance(multi, list) and multi:
            vector = multi[0]
            if isinstance(vector, list):
                results.append([float(value) for value in vector])
                continue

        raise RuntimeError("Invalid embeddings response from Ollama")

    return results


def _batched(iterable: List[str], batch_size: int) -> Iterable[List[str]]:
    for start in range(0, len(iterable), batch_size):
        yield iterable[start : start + batch_size]


def _generate_openai(config: dict, texts: List[str], batch_size: int) -> List[List[float]]:
    api_key = config.get("api_key") or _settings.openai_api_key
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured; cannot generate embeddings.")
    url = (
        config.get("openai_url")
        or config.get("api_url")
        or _settings.embedding_api_url
        or "https://api.openai.com/v1/embeddings"
    )
    model = config.get("openai_model") or _settings.openai_embed_model or config.get("model") or "text-embedding-3-small"
    timeout = float(config.get("timeout", 60))
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    embeddings: List[List[float]] = []
    for batch in _batched(texts, batch_size):
        payload = {
            "model": model,
            "input": batch,
        }
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=timeout)
            response.raise_for_status()
        except requests.RequestException as exc:
            logger.error("OpenAI embedding request failed: %s", exc)
            raise RuntimeError(f"OpenAI embedding request failed: {exc}") from exc

        body = response.json()
        data = body.get("data")
        if not isinstance(data, list) or len(data) != len(batch):
            raise RuntimeError("OpenAI embedding response malformed.")

        for item in data:
            embedding = item.get("embedding")
            if not isinstance(embedding, list):
                raise RuntimeError("OpenAI embedding response missing vector.")
            embeddings.append([float(value) for value in embedding])

    return embeddings


def generate_embeddings(texts: Iterable[str]) -> List[List[float]]:
    config = _load_config(_settings.embed_config)
    dims = int(config.get("dims", 1536))
    provider = (config.get("provider") or _settings.embed_provider).strip().lower()

    text_list = list(texts)
    if not text_list:
        return []

    def _provider_sequence(selected: str) -> List[str]:
        if selected == "auto":
            return ["ollama", "openai"]
        return [selected]

    batch_size = int(config.get("batch_size", 64))

    errors: List[str] = []
    for backend in _provider_sequence(provider):
        try:
            if backend == "ollama":
                logger.info(
                    "Using Ollama for embeddings (total=%d, batch_size=%d, model=%s)",
                    len(text_list),
                    batch_size,
                    config.get("ollama_model") or config.get("model") or _settings.embed_model,
                )
                return _generate_ollama(config, text_list, batch_size)
            if backend == "local":
                logger.info("Using Local for embeddings (batch=%d, dims=%d)", len(text_list), dims)
                return _generate_local(dims, text_list)
            if backend == "openai":
                logger.info(
                    "Using OpenAI for embeddings (total=%d, batch_size=%d, model=%s)",
                    len(text_list),
                    batch_size,
                    config.get("openai_model") or _settings.openai_embed_model or config.get("model"),
                )
                return _generate_openai(config, text_list, batch_size)
            errors.append(f"Unsupported backend '{backend}'")
        except RuntimeError as exc:
            errors.append(f"{backend}: {exc}")
            logger.warning("Embedding backend %s failed: %s", backend.upper(), exc)
            continue

    detail = "; ".join(errors) if errors else f"Unsupported embedding backend '{provider}'"
    raise RuntimeError(detail)


def embedding_dimension() -> int:
    config = _load_config(_settings.embed_config)
    return int(config.get("dims", 1536))
