"""LLM-only orchestration handler."""

from __future__ import annotations

import hashlib
import json
import logging
import re
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence

import httpx

import planner
import synthesis
from memory import approx_token_len, memory
from rag import estimate_confidence, hybrid_search, rerank
from risk import bound_trials, current_data_version, read as risk_read, run as risk_run, store as risk_store
from schemas import AssistantResponse, Plan
from settings import get_settings

logger = logging.getLogger("uvicorn.error")
settings = get_settings()

RAG_REQUIRED_MIN_SOURCES = 3
RAG_SCORE_THRESHOLD = settings.RAG_SCORE_THRESHOLD
RAG_MIN_CHARS = 300
DATE_BIAS_START = datetime(2024, 1, 1, tzinfo=timezone.utc)
APPLE_QUERY_TERMS = [
    "Apple",
    '"Apple Inc."',
    "AAPL",
    "App Store",
    "EU DMA",
    "antitrust",
    "DOJ",
    "CMA",
    "SAMR",
    "services revenue",
    "buybacks",
    "China",
    "India",
    "supply chain",
]
FORCE_RAG_KEYWORDS = [
    "company",
    "companies",
    "financial",
    "financials",
    "earnings",
    "revenue",
    "arr",
    "mrr",
    "kpi",
    "metric",
    "news",
    "policy",
    "regulation",
    "regulatory",
    "legal",
    "lawsuit",
    "litigation",
    "launch",
    "product launch",
    "product",
    "guidance",
    "since",
    "trend",
]
FRESHNESS_HINTS = ("latest", "recent", "since", "update", "new", "today", "this week")
INSUFFICIENT_MESSAGE = "INSUFFICIENT EVIDENCE"


def token_len(text: str | None) -> int:
    return approx_token_len(text)


def count_factual_claims(text: str) -> int:
    sentences = [segment.strip() for segment in re.split(r"[.!?]", text) if segment.strip()]
    count = 0
    for sentence in sentences:
        if re.search(r"\d", sentence) or any(keyword in sentence.lower() for keyword in ("percent", "increase", "decrease", "roi", "margin")):
            count += 1
    return count


def _should_force_rag(user_msg: str) -> bool:
    lowered = user_msg.lower()
    return any(keyword in lowered for keyword in FORCE_RAG_KEYWORDS)


def _is_short_query(user_msg: str) -> bool:
    return len(user_msg.split()) < 8


def _needs_fresh_results(user_msg: str) -> bool:
    lowered = user_msg.lower()
    return any(hint in lowered for hint in FRESHNESS_HINTS)


def _mentions_apple(user_msg: str) -> bool:
    lowered = user_msg.lower()
    return "apple" in lowered or "aapl" in lowered or "app store" in lowered


def _expand_queries(base_queries: List[str], user_msg: str) -> List[str]:
    seen: set[str] = set()
    expanded: List[str] = []
    for query in base_queries:
        if not query:
            continue
        normalized = query.strip()
        if not normalized:
            continue
        lowered = normalized.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        expanded.append(normalized)
    if _mentions_apple(user_msg):
        for term in APPLE_QUERY_TERMS:
            lowered = term.lower()
            if lowered not in seen:
                expanded.append(term)
                seen.add(lowered)
    return expanded or [user_msg]


def _filter_short_chunks(hits: List[Dict[str, Any]], min_chars: int = RAG_MIN_CHARS) -> List[Dict[str, Any]]:
    filtered: List[Dict[str, Any]] = []
    for hit in hits:
        text = str(hit.get("text") or "").strip()
        if len(text) >= min_chars:
            filtered.append(hit)
    return filtered


def _parse_doc_date(metadata: Dict[str, Any]) -> Optional[datetime]:
    for key in ("date", "published_at", "published", "timestamp"):
        value = metadata.get(key)
        if not isinstance(value, str):
            continue
        cleaned = value.strip()
        if not cleaned:
            continue
        normalized = cleaned.replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(normalized)
        except ValueError:
            continue
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed
    return None


def _apply_freshness_bias(hits: List[Dict[str, Any]], bias_recent: bool) -> List[Dict[str, Any]]:
    if not bias_recent:
        return hits
    scored: List[tuple[float, Dict[str, Any]]] = []
    for hit in hits:
        base_score = float(hit.get("score") or 0.0)
        metadata = hit.get("metadata") or {}
        doc_date = _parse_doc_date(metadata)
        bonus = 0.05 if doc_date and doc_date >= DATE_BIAS_START else 0.0
        scored.append((base_score + bonus, hit))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [item[1] for item in scored]


def _describe_title(hit: Dict[str, Any]) -> str:
    metadata = hit.get("metadata") or {}
    for key in ("title", "filename", "doc_title", "name"):
        value = metadata.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    source = metadata.get("source") or metadata.get("publisher")
    if isinstance(source, str) and source.strip():
        return source.strip()
    return str(hit.get("doc_id") or hit.get("chunk_id") or "unknown")


def _doc_identifier(hit: Dict[str, Any]) -> Optional[str]:
    doc_id = hit.get("doc_id")
    chunk_id = hit.get("chunk_id")
    if isinstance(doc_id, str) and doc_id.strip():
        return doc_id.strip()
    if isinstance(chunk_id, str) and chunk_id.strip():
        return chunk_id.strip()
    return None


def _deduplicate_hits(hits: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen: set[tuple[str, str, str]] = set()
    unique: List[Dict[str, Any]] = []
    for hit in hits:
        metadata = hit.get("metadata") or {}
        outlet = str(metadata.get("source") or metadata.get("publisher") or metadata.get("outlet") or "").strip().lower()
        title = _describe_title(hit).strip().lower()
        doc_date = _parse_doc_date(metadata) or None
        date_key = doc_date.date().isoformat() if doc_date else ""
        dedupe_key = (outlet, date_key, title or str(hit.get("chunk_id")))
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        unique.append(hit)
    return unique


def _pick_metadata_string(metadata: Dict[str, Any], keys: Sequence[str]) -> Optional[str]:
    for key in keys:
        value = metadata.get(key)
        if isinstance(value, str):
            candidate = value.strip()
            if candidate:
                return candidate
    nested = metadata.get("user_metadata")
    if isinstance(nested, dict):
        for key in keys:
            value = nested.get(key)
            if isinstance(value, str):
                candidate = value.strip()
                if candidate:
                    return candidate
    return None


def _resolve_meta_file_name(metadata: Dict[str, Any], fallback: str) -> str:
    name = _pick_metadata_string(
        metadata,
        ("file_name", "filename", "original_basename", "title", "doc_title", "name"),
    )
    if name:
        return name
    source = metadata.get("source")
    if isinstance(source, str) and source.strip():
        return source.strip()
    return fallback


def _resolve_meta_path(metadata: Dict[str, Any], doc: Optional[Dict[str, Any]] = None) -> Optional[str]:
    path = _pick_metadata_string(
        metadata,
        ("path", "raw_path", "raw_uri", "rawKey", "raw_key", "object", "object_key"),
    )
    if path:
        return path
    if doc:
        for key in ("path", "raw_path", "raw_uri", "s3_path", "uri", "url", "object", "object_key"):
            value = doc.get(key) if isinstance(doc, dict) else None
            if isinstance(value, str):
                candidate = value.strip()
                if candidate:
                    return candidate
    return None


def _build_citation_meta(final_citations: Sequence[Dict[str, str]], docs: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not docs:
        return []
    lookup: Dict[str, Dict[str, Any]] = {}
    insertion_order: List[str] = []
    for doc in docs:
        doc_id = str(doc.get("doc_id") or doc.get("chunk_id") or "").strip()
        if not doc_id or doc_id in lookup:
            continue
        lookup[doc_id] = doc
        insertion_order.append(doc_id)
    entries: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for citation in final_citations:
        cid = str(citation.get("id") or "").strip()
        if not cid or cid in seen or cid not in lookup:
            continue
        doc = lookup[cid]
        metadata = doc.get("metadata") or {}
        path = _resolve_meta_path(metadata if isinstance(metadata, dict) else {}, doc)
        if not path:
            continue
        file_name = _resolve_meta_file_name(metadata if isinstance(metadata, dict) else {}, cid)
        entry: Dict[str, Any] = {"id": cid, "file_name": file_name, "path": path}
        score = doc.get("score") if isinstance(doc, dict) else None
        if not isinstance(score, (int, float)):
            for key in ("rerank_score", "score_vector", "score_bm25"):
                alt = doc.get(key) if isinstance(doc, dict) else None
                if isinstance(alt, (int, float)):
                    score = alt
                    break
        if isinstance(score, (int, float)):
            entry["score"] = round(float(score), 3)
        entries.append(entry)
        seen.add(cid)
    if entries:
        return entries
    # Fallback: include the retrieved docs directly when the writer omitted structured citations.
    for doc_id in insertion_order:
        if doc_id in seen:
            continue
        doc = lookup[doc_id]
        metadata = doc.get("metadata") or {}
        path = _resolve_meta_path(metadata if isinstance(metadata, dict) else {}, doc)
        if not path:
            continue
        file_name = _resolve_meta_file_name(metadata if isinstance(metadata, dict) else {}, doc_id)
        entry = {"id": doc_id, "file_name": file_name, "path": path}
        score = doc.get("score")
        if not isinstance(score, (int, float)):
            for key in ("rerank_score", "score_vector", "score_bm25"):
                alt = doc.get(key)
                if isinstance(alt, (int, float)):
                    score = alt
                    break
        if isinstance(score, (int, float)):
            entry["score"] = round(float(score), 3)
        entries.append(entry)
        seen.add(doc_id)
    return entries


def build_disclosure(rag_pack: Optional[Dict[str, Any]], risk_pack: Optional[Dict[str, Any]]) -> str:
    docs_used = len((rag_pack or {}).get("docs") or [])
    risk_used = bool((risk_pack or {}).get("result"))
    if rag_pack or risk_pack:
        doc_phrase = f"Documents ({docs_used})"
        sim_version = (risk_pack or {}).get("version") or current_data_version()
        sim_phrase = f"Simulation v{sim_version}" if risk_used else "Simulation (not used)"
        return f"Answered by LLM with help from: {doc_phrase} · {sim_phrase}"
    return "Answered by LLM (no external evidence used)."


def build_used(
    plan: Plan,
    rag_pack: Optional[Dict[str, Any]],
    risk_pack: Optional[Dict[str, Any]],
    rag_debug: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    used: Dict[str, Any] = {}
    if rag_pack:
        doc_ids = [
            str(doc.get("doc_id") or doc.get("chunk_id"))
            for doc in rag_pack.get("docs", [])
            if doc.get("doc_id") or doc.get("chunk_id")
        ]
        entry: Dict[str, Any] = {"docIds": doc_ids, "confidence": rag_pack.get("confidence")}
        if rag_pack.get("router"):
            entry["router"] = rag_pack["router"]
        used["rag"] = entry
    elif rag_debug:
        used["rag"] = {"docIds": [], "confidence": 0.0, "debug": rag_debug}
    if risk_pack:
        risk_entry: Dict[str, Any] = {
            "signature": risk_pack.get("signature"),
            "version": risk_pack.get("version"),
            "vars": (plan.riskSpec or {}).get("variables") or {},
        }
        if risk_pack.get("error"):
            risk_entry["error"] = risk_pack["error"]
        used["risk"] = risk_entry
    return used


def _build_insufficient_response(
    *,
    plan: Plan,
    thread_id: str,
    user_msg: str,
    short_ctx: str,
    telemetry: Dict[str, Any],
    total_latency_ms: float,
    rag_debug: Optional[Dict[str, Any]],
) -> AssistantResponse:
    memory.append_turn(thread_id, user=user_msg, assistant=INSUFFICIENT_MESSAGE)
    long_updated = memory.maybe_update_long_summary(thread_id, summary_every=settings.summary_update_turns)
    metrics = {
        "tokens_in": 0,
        "tokens_out": 0,
        "cost_usd": 0.0,
        "latency_ms": total_latency_ms,
    }
    telemetry.setdefault("docIds", [])
    telemetry.setdefault("citation_count", 0)
    telemetry.setdefault("citation_miss_rate", 1.0)
    telemetry.setdefault("memory_short_tokens", token_len(short_ctx))
    used = build_used(plan, None, None, rag_debug=rag_debug)
    return AssistantResponse(
        route="RAG",
        text=INSUFFICIENT_MESSAGE,
        used=used,
        citations=[],
        charts=None,
        memory={"shortTokens": token_len(short_ctx), "longSummaryUpdated": long_updated},
        metrics=metrics,
        telemetry=telemetry,
        meta={},
    )


async def handle_query(thread_id: str, user_msg: str, meta: Dict[str, Any]) -> AssistantResponse:
    t0 = time.time()

    short_ctx = memory.get_recent_window(thread_id, token_cap=settings.memory_short_cap_tokens)
    long_ctx = memory.retrieve_long_summary(thread_id)
    recalls = memory.vector_recall(thread_id, user_msg, top_k=5)

    plan = await planner.plan(user_msg, short_ctx, long_ctx, recalls)
    shape_hint = synthesis.infer_shape(user_msg)

    rag_pack: Optional[Dict[str, Any]] = None
    rag_conf = 0.0
    rag_latency_ms = 0.0
    rag_debug_payload: Optional[Dict[str, Any]] = None
    router_metadata: Optional[Dict[str, Any]] = None
    risk_pack: Optional[Dict[str, Any]] = None
    risk_error: Optional[str] = None

    telemetry: Dict[str, Any] = {
        "plan": plan.model_dump(),
        "rag_used": False,
        "risk_used": False,
        "meta": meta or {},
    }

    force_rag = _should_force_rag(user_msg)
    rag_required = plan.needRag or force_rag
    telemetry["rag_required"] = rag_required
    telemetry["rag_mode_forced"] = force_rag

    if rag_required:
        top_k = 12 if _is_short_query(user_msg) else 10
        rewrites = _expand_queries(plan.ragQueries or [user_msg], user_msg)
        freshness_bias = _needs_fresh_results(user_msg)
        telemetry["rag_rewrites"] = rewrites
        t_rag = time.time()
        hits: List[Dict[str, Any]] = []
        rag_failure: Optional[str] = None
        try:
            hits = await hybrid_search(rewrites, top_k=top_k)
        except httpx.HTTPError as exc:
            status_code = getattr(exc.response, "status_code", None)
            rag_failure = "INDEX_NOT_READY" if status_code in {425, 429, 503} else "INDEX_NOT_READY"
            rag_debug_payload = {"error": str(exc)}
        except Exception as exc:  # pragma: no cover - defensive
            rag_failure = "INDEX_NOT_READY"
            rag_debug_payload = {"error": str(exc)}
        finally:
            rag_latency_ms = (time.time() - t_rag) * 1000

        if not rag_failure:
            filtered_hits = _filter_short_chunks(hits, RAG_MIN_CHARS)
            rerank_k = max(top_k, settings.max_context_chunks)
            re_ranked = rerank(filtered_hits, k=rerank_k)
            re_ranked = _apply_freshness_bias(re_ranked, freshness_bias)
            deduped_hits = _deduplicate_hits(re_ranked)
            rag_conf = estimate_confidence(deduped_hits)
            max_score = max((float(hit.get("score") or 0.0) for hit in deduped_hits), default=0.0)
            high_quality_ids: List[str] = []
            for hit in deduped_hits:
                score = float(hit.get("score") or 0.0)
                if score >= RAG_SCORE_THRESHOLD:
                    identifier = _doc_identifier(hit)
                    if identifier:
                        high_quality_ids.append(identifier)
            distinct_doc_ids = list(dict.fromkeys(high_quality_ids))
            doc_count = len(distinct_doc_ids)
            router_metadata = {
                "route": "RAG",
                "top_k": top_k,
                "threshold": RAG_SCORE_THRESHOLD,
                "doc_count": doc_count,
                "doc_total": len(deduped_hits),
                "max_score": round(max_score, 3),
                "freshness_bias": freshness_bias,
            }
            telemetry["router_metadata"] = router_metadata
            if doc_count >= RAG_REQUIRED_MIN_SOURCES:
                trimmed_docs = deduped_hits[: settings.max_context_chunks]
                rag_pack = {
                    "docs": trimmed_docs,
                    "confidence": rag_conf,
                    "latency_ms": rag_latency_ms,
                    "router": router_metadata,
                }
                telemetry["rag_used"] = True
            else:
                rag_failure = "NO_MATCHES" if not deduped_hits else "LOW_CONFIDENCE"
                rag_debug_payload = {
                    "top_scores": [round(float(hit.get("score") or 0.0), 3) for hit in deduped_hits[:3]],
                    "matched_titles": [_describe_title(hit) for hit in deduped_hits[:3]],
                    "corpus_status_hint": rag_failure,
                }

        if rag_failure:
            total_latency_ms = round((time.time() - t0) * 1000, 1)
            telemetry.update(
                {
                    "rag_failure": rag_failure,
                    "rag_debug": rag_debug_payload or {},
                    "rag_latency_ms": round(rag_latency_ms, 1),
                    "rag_conf": rag_conf,
                    "router_metadata": router_metadata
                    or {
                        "route": "RAG",
                        "top_k": top_k,
                        "threshold": RAG_SCORE_THRESHOLD,
                        "doc_count": 0,
                        "doc_total": 0,
                        "max_score": 0.0,
                        "freshness_bias": freshness_bias,
                    },
                    "disclosure": "Retrieval confidence gate failed before synthesis.",
                    "helpUsed": {"rag": False, "risk": False},
                    "target_latency_ms": settings.target_p95_llm_rag,
                    "within_latency_budget": total_latency_ms <= settings.target_p95_llm_rag,
                    "latency_ms": total_latency_ms,
                }
            )
            return _build_insufficient_response(
                plan=plan,
                thread_id=thread_id,
                user_msg=user_msg,
                short_ctx=short_ctx,
                telemetry=telemetry,
                total_latency_ms=total_latency_ms,
                rag_debug=rag_debug_payload,
            )

    risk_spec = plan.riskSpec if isinstance(plan.riskSpec, dict) else None
    if plan.needRisk:
        if not risk_spec:
            risk_error = "risk_spec_missing"
            risk_pack = {"result": None, "version": current_data_version(), "cache": False, "error": risk_error}
            telemetry.update({"risk_attempted": False, "risk_used": False, "risk_error": risk_error})
        else:
            data_version = current_data_version()
            signature_payload = {"spec": risk_spec, "v": data_version}
            signature = hashlib.sha256(json.dumps(signature_payload, sort_keys=True).encode("utf-8")).hexdigest()
            cached = risk_read(signature)
            cache_hit = False
            sim_result: Optional[Dict[str, Any]] = None
            if cached:
                sim_result = cached
                cache_hit = True
            else:
                bounded = bound_trials(risk_spec, max_trials=settings.risk_max_trials)
                sim_payload = await risk_run(bounded)
                if isinstance(sim_payload, dict) and not sim_payload.get("error"):
                    sim_result = sim_payload
                    risk_store(signature, sim_payload)
                else:
                    risk_error = (sim_payload or {}).get("error") if isinstance(sim_payload, dict) else "simulation_failed"
            risk_pack = {"signature": signature, "result": sim_result, "version": data_version, "cache": cache_hit}
            if risk_error:
                risk_pack["error"] = risk_error
                telemetry["risk_error"] = risk_error
            telemetry.update(
                {
                    "risk_attempted": True,
                    "risk_used": bool(sim_result),
                    "risk_cache_hit": cache_hit,
                    "risk_signature": signature,
                    "risk_version": data_version,
                }
            )

    disclosure = build_disclosure(rag_pack, risk_pack)
    rag_docs = (rag_pack or {}).get("docs", [])
    evidence_hint = None
    force_no_citations = False
    if rag_required and not rag_docs:
        evidence_hint = "Document search did not meet the confidence threshold—acknowledge uncertainty and rely on conversation memory."
        force_no_citations = True

    final = await synthesis.compose(
        user_msg=user_msg,
        plan=plan,
        short_ctx=short_ctx,
        long_ctx=long_ctx,
        recalls=recalls,
        rag_docs=rag_docs,
        risk=(risk_pack or {}).get("result"),
        disclosure=disclosure,
        shape=shape_hint,
        force_no_citations=force_no_citations,
        evidence_hint=evidence_hint,
        router_metadata=(rag_pack or {}).get("router"),
        rag_template=bool(rag_pack),
    )

    if rag_pack and count_factual_claims(final.text) > 2 and len(final.citations or []) < 2:
        final = synthesis.acknowledge_low_evidence(final)

    memory.append_turn(thread_id, user=user_msg, assistant=final.text)
    long_updated = memory.maybe_update_long_summary(thread_id, summary_every=settings.summary_update_turns)

    total_latency_ms = round((time.time() - t0) * 1000, 1)
    metrics = final.metrics | {
        "latency_ms": total_latency_ms,
    }

    doc_ids = [cite["id"] for cite in final.citations]
    citation_count = len(final.citations)
    claims = max(1, count_factual_claims(final.text))
    expected_citations = max(1, min(claims, len((rag_pack or {}).get("docs", []))))
    citation_miss_rate = (
        0.0 if not rag_pack else max(0.0, 1.0 - (citation_count / expected_citations if expected_citations else 1.0))
    )

    risk_result = (risk_pack or {}).get("result")
    risk_active = bool(risk_result)
    help_used = {"rag": bool(rag_pack), "risk": risk_active}
    latency_target = (
        settings.target_p95_llm_risk if risk_active else settings.target_p95_llm_rag if rag_pack else settings.target_p95_llm
    )

    telemetry.update(
        {
            "docIds": doc_ids,
            "citation_count": citation_count,
            "citation_miss_rate": round(citation_miss_rate, 4),
            "latency_ms": total_latency_ms,
            "target_latency_ms": latency_target,
            "within_latency_budget": total_latency_ms <= latency_target,
            "tokens_in": metrics.get("tokens_in", 0),
            "tokens_out": metrics.get("tokens_out", 0),
            "cost_usd": metrics.get("cost_usd", 0.0),
            "memory_short_tokens": token_len(short_ctx),
            "long_summary_updated": long_updated,
            "helpUsed": help_used,
            "disclosure": disclosure,
            "rag_latency_ms": round(rag_latency_ms, 1),
            "model": final.model or "",
        }
    )
    if "rag_conf" not in telemetry:
        telemetry["rag_conf"] = rag_conf
    telemetry.setdefault("planner_conf", plan.confidence)

    route = "LLM_ONLY"
    if rag_pack and risk_active:
        route = "RAG_RISK"
    elif rag_pack:
        route = "RAG"
    elif risk_active:
        route = "RISK"
    telemetry["route"] = route

    meta_payload: Dict[str, Any] = {}
    structured_citations = _build_citation_meta(final.citations, rag_docs)
    if structured_citations:
        meta_payload["citations"] = structured_citations
    if risk_pack and risk_pack.get("error"):
        meta_payload["risk"] = {"error": risk_pack["error"]}

    response = AssistantResponse(
        route=route,
        text=final.text,
        used=build_used(plan, rag_pack, risk_pack, rag_debug=rag_debug_payload),
        citations=final.citations,
        charts=final.charts,
        memory={"shortTokens": token_len(short_ctx), "longSummaryUpdated": long_updated},
        metrics=metrics,
        telemetry=telemetry,
        meta=meta_payload,
    )
    return response
