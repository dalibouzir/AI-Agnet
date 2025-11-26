"""In-memory conversational memory primitives."""

from __future__ import annotations

import threading
from collections import deque
from dataclasses import dataclass
from typing import Deque, Dict, List, Tuple


def approx_token_len(text: str | None) -> int:
    """Best-effort token approximation used for windowing."""
    if not text:
        return 0
    return max(1, len(text.strip().split()))


@dataclass
class MemoryTurn:
    user: str
    assistant: str
    tokens: int


class MemoryStore:
    """Thread-safe memory bucket for in-flight conversations."""

    def __init__(self) -> None:
        self._turns: Dict[str, Deque[MemoryTurn]] = {}
        self._summaries: Dict[str, str] = {}
        self._turn_counters: Dict[str, int] = {}
        self._locks: Dict[str, threading.Lock] = {}

    def _lock_for(self, thread_id: str) -> threading.Lock:
        lock = self._locks.get(thread_id)
        if lock is None:
            lock = threading.Lock()
            self._locks[thread_id] = lock
        return lock

    def get_recent_window(self, thread_id: str, token_cap: int) -> str:
        """Return the newest convo turns capped by tokens."""
        if token_cap <= 0:
            return ""
        turns = self._turns.get(thread_id)
        if not turns:
            return ""
        budget = token_cap
        collected: List[str] = []
        for turn in reversed(turns):
            block_tokens = approx_token_len(turn.user) + approx_token_len(turn.assistant)
            if budget - block_tokens < 0 and collected:
                break
            budget -= block_tokens
            collected.append(f"User: {turn.user}\nAssistant: {turn.assistant}")
            if budget <= 0:
                break
        return "\n\n".join(reversed(collected))

    def retrieve_long_summary(self, thread_id: str) -> str:
        return self._summaries.get(thread_id, "")

    def vector_recall(self, thread_id: str, query: str, top_k: int = 5) -> List[Dict[str, str]]:
        """Return naive semantic recall ordered by Jaccard overlap."""
        turns = self._turns.get(thread_id)
        if not turns:
            return []
        query_tokens = set(token.lower() for token in query.split())
        scored: List[Tuple[float, MemoryTurn]] = []
        for turn in turns:
            haystack = f"{turn.user} {turn.assistant}"
            hay_tokens = set(token.lower() for token in haystack.split())
            if not hay_tokens:
                continue
            overlap = len(query_tokens & hay_tokens)
            union = len(query_tokens | hay_tokens) or 1
            score = overlap / union
            if score > 0:
                scored.append((score, turn))
        scored.sort(key=lambda item: item[0], reverse=True)
        results: List[Dict[str, str]] = []
        for score, turn in scored[: max(1, top_k)]:
            results.append({"text": f"{turn.user}\n{turn.assistant}", "score": round(score, 4)})
        return results

    def append_turn(self, thread_id: str, user: str, assistant: str) -> None:
        with self._lock_for(thread_id):
            turns = self._turns.setdefault(thread_id, deque(maxlen=40))
            tokens = approx_token_len(user) + approx_token_len(assistant)
            turns.append(MemoryTurn(user=user, assistant=assistant, tokens=tokens))
            self._turn_counters[thread_id] = self._turn_counters.get(thread_id, 0) + 1

    def maybe_update_long_summary(self, thread_id: str, summary_every: int = 6, cap_chars: int = 1200) -> bool:
        turns = self._turns.get(thread_id)
        if not turns:
            return False
        turn_count = self._turn_counters.get(thread_id, 0)
        if turn_count % max(1, summary_every) != 0:
            return False
        snippets = []
        for turn in turns:
            snippets.append(f"- {turn.user.strip()[:160]} -> {turn.assistant.strip()[:200]}")
        summary = "\n".join(snippets)[-cap_chars:]
        self._summaries[thread_id] = summary
        return True


memory = MemoryStore()
