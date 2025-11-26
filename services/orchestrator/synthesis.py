"""Final answer synthesis tailored to the user's requested structure."""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Any, Dict, Optional, Sequence
from urllib.parse import quote

from llm_client import complete
from schemas import FinalDraft, Plan
from settings import get_settings

logger = logging.getLogger("uvicorn.error")
settings = get_settings()


@dataclass(frozen=True)
class ShapeHint:
    kind: str
    count: Optional[int] = None
    raw: Optional[str] = None


def infer_shape(user_msg: str) -> ShapeHint:
    lowered = user_msg.lower()

    paragraph_match = re.search(r"(\d+)\s+(?:cohesive\s+)?paragraph", lowered)
    bullet_match = re.search(r"(\d+)\s+(?:key\s+)?bullet", lowered)
    sentence_match = re.search(r"(\d+)\s+sentence", lowered)

    if paragraph_match:
        return ShapeHint(kind="paragraphs", count=int(paragraph_match.group(1)), raw=paragraph_match.group(0))
    if bullet_match or "bullet" in lowered or "list" in lowered:
        count = int(bullet_match.group(1)) if bullet_match else None
        return ShapeHint(kind="bullets", count=count, raw=bullet_match.group(0) if bullet_match else None)
    if sentence_match:
        return ShapeHint(kind="sentences", count=int(sentence_match.group(1)), raw=sentence_match.group(0))
    if "memo" in lowered or "short note" in lowered:
        return ShapeHint(kind="note")
    if "table" in lowered:
        return ShapeHint(kind="table")
    if "summary" in lowered and "one" in lowered:
        return ShapeHint(kind="summary")
    return ShapeHint(kind="paragraphs", count=2)


def _shape_instruction(shape: ShapeHint) -> str:
    if shape.kind == "paragraphs":
        if shape.count:
            return f"Write exactly {shape.count} cohesive paragraphs. No headings."
        return "Write a concise set of paragraphs without headings."
    if shape.kind == "bullets":
        if shape.count:
            return f"Write exactly {shape.count} bullet points."
        return "Write a focused bulleted list."
    if shape.kind == "sentences":
        if shape.count:
            return f"Write exactly {shape.count} sentences."
        return "Write short, direct sentences."
    if shape.kind == "note":
        return "Write a tight executive note (3-4 sentences)."
    if shape.kind == "table":
        return "Provide a simple markdown table if information allows; otherwise fall back to tight sentences."
    if shape.kind == "summary":
        return "Write one brief summary paragraph."
    return "Write a clear, structured response that mirrors the user's requested format."


def _format_documents(docs: Sequence[Dict[str, Any]]) -> str:
    if not docs:
        return "None"
    lines = []
    for index, doc in enumerate(docs, start=1):
        doc_id = doc.get("doc_id") or doc.get("chunk_id") or f"doc_{index}"
        title = doc.get("metadata", {}).get("title") or doc.get("metadata", {}).get("filename") or doc_id
        text = (doc.get("text") or "").strip()
        if text:
            lines.append(f"[{doc_id}] {title}\n{text}")
    return "\n\n".join(lines[:5]) or "None"


def _format_simulation(sim: Optional[Dict[str, Any]]) -> str:
    if not sim:
        return "None"
    stats = sim.get("stats") or {}
    metadata = sim.get("metadata") or {}
    return (
        f"Trials: {stats.get('n') or metadata.get('n')}\n"
        f"Mean: {stats.get('mean')}\n"
        f"P50: {stats.get('p50')}\n"
        f"P95: {stats.get('p95')}\n"
        f"P(loss): {stats.get('p_loss')}\n"
        f"Notes: {metadata.get('scenarioNotes') or metadata.get('notes') or ''}"
    )


def _extract_json(text: str) -> Dict[str, Any]:
    snippet = text.strip()
    start = snippet.find("{")
    end = snippet.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("LLM output missing JSON block")
    return json.loads(snippet[start : end + 1])


def _extract_inline_doc_ids(text: str) -> list[str]:
    ids: list[str] = []
    for match in re.findall(r"\[\^([^\]]+)\]", text or ""):
        cleaned = match.strip()
        if cleaned and cleaned not in ids:
            ids.append(cleaned)
    return ids


def _stitch_docs_base_url(path: str) -> str:
    base = settings.docs_base_url or "http://localhost:3000/docs"
    separator = "&" if "?" in base else "?"
    return f"{base}{separator}path={quote(path, safe='')}"


def _resolve_doc_url(doc_id: str, metadata: Dict[str, Any]) -> str:
    if metadata:
        for key in ("path", "raw_path", "raw_uri", "rawKey", "raw_key", "object", "object_key"):
            value = metadata.get(key)
            if isinstance(value, str) and value.strip():
                return _stitch_docs_base_url(value.strip())
    return f"doc/{doc_id}"


def _build_citation_lookup(docs: Sequence[Dict[str, Any]]) -> Dict[str, Dict[str, str]]:
    lookup: Dict[str, Dict[str, str]] = {}
    for doc in docs:
        doc_id = str(doc.get("doc_id") or "" ).strip()
        if not doc_id:
            continue
        metadata = doc.get("metadata") or {}
        candidate = metadata.get("title") or metadata.get("filename") or doc.get("source") or doc.get("doc_id")
        title = str(candidate or "").strip() or doc_id
        url = _resolve_doc_url(doc_id, metadata if isinstance(metadata, dict) else {})
        lookup[doc_id] = {"title": title, "url": url}
    return lookup


def _wants_charts(user_msg: str) -> bool:
    lowered = user_msg.lower()
    chart_keywords = ("chart", "graph", "plot", "visual", "visualize", "visualise", "diagram")
    return any(keyword in lowered for keyword in chart_keywords)


def _apply_clickable_citations(text: str, citations: Sequence[Dict[str, str]]) -> str:
    updated = text or ""
    for citation in citations:
        cid = citation.get("id")
        title = citation.get("title") or cid
        url = citation.get("url")
        if not cid or not title:
            continue
        pattern = re.escape(f"[^{cid}]")
        replacement = f"[{title}]({url or f'doc/{cid}'})"
        updated = re.sub(pattern, replacement, updated)
    return updated


async def compose(
    *,
    user_msg: str,
    plan: Plan,
    short_ctx: str,
    long_ctx: str,
    recalls: Sequence[Dict[str, Any]],
    rag_docs: Sequence[Dict[str, Any]],
    risk: Optional[Dict[str, Any]],
    disclosure: str,
    shape: ShapeHint,
    force_no_citations: bool = False,
    evidence_hint: Optional[str] = None,
    router_metadata: Optional[Dict[str, Any]] = None,
    rag_template: bool = False,
) -> FinalDraft:
    """Call the writer LLM with the requested structure enforced."""
    instructions = [
        "You are the final assistant. Use the retrieved DOCUMENTS and/or SIMULATION data plus conversation context.",
        "Follow the user's requested structure exactly—no extra headings unless explicitly asked.",
        "Respond in a single narrative voice—never mention planners, helper modes (LLM/RAG/Risk), or retrieval steps.",
        "Do not inject stock sections such as Executive Summary, Key Facts, Why It Matters, or Next Best Actions unless the user or this system instruction explicitly requires them.",
        _shape_instruction(shape),
        "Include concrete numbers, deltas, currency, and dates when available.",
        "Return ONLY valid JSON (no Markdown fences) using this schema: {\"text\":string,\"citations\":[{\"id\":string,\"title\":string}],\"chartsSpec\":object|null}.",
        "Fill the 'text' field with the final answer that follows the requested format; use an empty array for 'citations' when none exist and omit extra keys.",
    ]
    if _wants_charts(user_msg):
        instructions.append(
            "The user referenced charts/graphs: in addition to the narrative, return a `chartsSpec` entry that visualises the primary metric (for example revenue by year) using a clear data structure such as {\"type\":\"line\",\"title\":\"Revenue Growth\",\"data\":{\"rows\":[{\"year\":2022,\"revenue\":20500000},...]}}."
        )
    if rag_docs and not force_no_citations:
        instructions.append(
            "Each factual sentence (>12 words) that quotes numbers/dates/names from DOCUMENTS must include a citation [^docId] "
            "immediately after the claim."
        )
    if rag_template and rag_docs:
        instructions.extend(
            [
                "Because DOCUMENTS qualified under the evidence gate, follow this structure exactly:",
                "Executive Summary — up to 5 concise bullet points focused on the user's question.",
                "Evidence Table — provide a Markdown table with headers 'Source | Date | Key Fact | Score' and at least 3 rows drawn from distinct documents.",
                "Quotes — add 2-3 short quoted lines (\"...\") that include inline citations plus source and date in parentheses.",
                "Citations — finish with a bullet list of the cited doc IDs/titles or links.",
            ]
        )
        if router_metadata:
            instructions.append(
                "Append one final line that reports router metadata exactly as "
                f"route={router_metadata.get('route', 'RAG')}, "
                f"top_k={router_metadata.get('top_k')}, "
                f"threshold={router_metadata.get('threshold')}, "
                f"doc_count={router_metadata.get('doc_count')}, "
                f"max_score={router_metadata.get('max_score')}."
            )
        else:
            instructions.append(
                "Append one final line summarizing router metadata as "
                "route=<mode>, top_k=<value>, threshold=<value>, doc_count=<value>, max_score=<value>."
            )
    if risk:
        instructions.append(
            "When simulations are used, cite only mean, p50, p95, and probability of loss plus one sentence on assumptions—never dump raw arrays or templates."
        )
    if force_no_citations:
        instructions.append("Document retrieval was too weak; do NOT fabricate citations.")
    if evidence_hint:
        instructions.append(f"Context note: {evidence_hint}")
    instructions.append("Do not repeat this disclosure inside the answer: " + disclosure)

    context = (
        f"Short context:\n{short_ctx or 'None'}\n\n"
        f"Long summary:\n{long_ctx or 'None'}\n\n"
        f"Vector recalls:\n{_format_recalls(recalls)}\n\n"
        f"Documents:\n{_format_documents(rag_docs)}\n\n"
        f"Simulation:\n{_format_simulation(risk)}\n\n"
        f"User message:\n{user_msg}"
    )
    profile_name = settings.writer_profile or "json_structured"
    payload = {
        "system": "\n".join(instructions),
        "messages": [{"role": "user", "content": context}],
        "temperature": 0.25 if rag_docs else 0.35,
        "top_p": 0.9,
        "max_tokens": 640,
        "profile": profile_name,
        "mode": "LLM_ONLY",
        "answer_format": "custom",
    }
    fallback_message = "I ran into an issue contacting the generation service. Please retry shortly."
    citation_lookup = _build_citation_lookup(rag_docs)
    data: Dict[str, Any] | None = None
    try:
        data = await complete(payload)
    except Exception as exc:
        logger.error("LLM synthesis failed: %s | raw=%r", exc, "")
        return FinalDraft(
            text=fallback_message,
            citations=[],
            charts=None,
            metrics={"tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0},
            model=None,
        )

    raw_text = str(data.get("text") or "")
    try:
        parsed = _extract_json(raw_text)
        text = str(parsed.get("text") or "").strip()
        citations = parsed.get("citations") or []
        if not isinstance(citations, list):
            citations = []
        normalized_citations: list[Dict[str, str]] = []
        for item in citations:
            if isinstance(item, dict):
                cid = str(item.get("id") or item.get("doc_id") or "").strip()
                if not cid:
                    continue
                lookup_entry = citation_lookup.get(cid) or {}
                title = (str(item.get("title") or item.get("name") or lookup_entry.get("title") or cid).strip()) or cid
                url = lookup_entry.get("url") or f"doc/{cid}"
                normalized_citations.append({"id": cid, "title": title, "url": url})
        text = _apply_clickable_citations(text, normalized_citations)
        charts = parsed.get("chartsSpec") if isinstance(parsed.get("chartsSpec"), dict) else None
        metrics = {
            "tokens_in": int(data.get("prompt_eval_count") or 0),
            "tokens_out": int(data.get("eval_count") or 0),
            "cost_usd": float(data.get("raw", {}).get("billing", 0.0))
            if isinstance(data.get("raw"), dict)
            else 0.0,
        }
        return FinalDraft(text=text, citations=normalized_citations, charts=charts, metrics=metrics, model=str(data.get("model") or ""))
    except Exception as exc:
        sample = raw_text[:400]
        logger.error("LLM synthesis failed: %s | raw=%r", exc, sample)
        metrics = {
            "tokens_in": int(data.get("prompt_eval_count") or 0),
            "tokens_out": int(data.get("eval_count") or 0),
            "cost_usd": float(data.get("raw", {}).get("billing", 0.0))
            if isinstance(data.get("raw"), dict)
            else 0.0,
        }
        inline_ids = _extract_inline_doc_ids(raw_text)
        fallback_citations = []
        for cid in inline_ids:
            lookup_entry = citation_lookup.get(cid) or {}
            title = lookup_entry.get("title") or cid
            url = lookup_entry.get("url") or f"doc/{cid}"
            fallback_citations.append({"id": cid, "title": title, "url": url})
        fallback_text = raw_text.strip() or fallback_message
        fallback_text = _apply_clickable_citations(fallback_text, fallback_citations)
        return FinalDraft(
            text=fallback_text,
            citations=fallback_citations,
            charts=None,
            metrics=metrics,
            model=str(data.get("model") or ""),
        )


def acknowledge_low_evidence(final: FinalDraft) -> FinalDraft:
    """Append a note when citations were expected but not available."""
    text = (
        "Document search returned insufficient evidence for citations, so the following summary relies on conversation context only:\n\n"
        f"{final.text}"
    )
    return FinalDraft(text=text, citations=[], charts=final.charts, metrics=final.metrics, model=final.model)
def _format_recalls(recalls: Sequence[Dict[str, Any]]) -> str:
    if not recalls:
        return "None"
    lines = []
    for recall in recalls[:5]:
        text = str(recall.get("text") or "").strip()
        score = recall.get("score")
        if text:
            prefix = f"(score={score}) " if score is not None else ""
            lines.append(f"{prefix}{text}")
    return "\n".join(lines) or "None"
