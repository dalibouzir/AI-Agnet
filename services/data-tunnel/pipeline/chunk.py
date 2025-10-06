from typing import Dict, List

try:
    import yaml
except ImportError:  # pragma: no cover
    yaml = None


def load_strategy(path) -> Dict[str, int | str]:
    if yaml:
        with open(path, "r", encoding="utf-8") as handle:
            data = yaml.safe_load(handle) or {}
            return data.get("strategy", {})
    strategy: Dict[str, int | str] = {}
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            if ":" in line:
                key, value = line.strip().split(":", 1)
                strategy[key.strip()] = value.strip().strip('"')
    return strategy


def _word_chunks(words: List[str], max_tokens: int, overlap: int) -> List[List[str]]:
    chunks: List[List[str]] = []
    start = 0
    while start < len(words):
        end = min(start + max_tokens, len(words))
        chunks.append(words[start:end])
        if end == len(words):
            break
        start = max(0, end - overlap)
    return chunks


def semantic_chunks(text: str, strategy_cfg: Dict[str, int | str]) -> List[str]:
    max_tokens = int(strategy_cfg.get("max_tokens", 700))
    overlap = int(strategy_cfg.get("overlap_tokens", 80))
    words = text.split()
    return [" ".join(chunk) for chunk in _word_chunks(words, max_tokens, overlap)]


def split_tables(table_text: str, mode: str) -> List[str]:
    if mode == "row":
        return table_text.splitlines()
    return [table_text]


def slide_per_page(pages: List[str]) -> List[str]:
    return pages  # stub: one slide per page content
