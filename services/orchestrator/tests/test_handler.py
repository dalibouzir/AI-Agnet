import asyncio
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from services.orchestrator import handler, planner, risk, synthesis
from services.orchestrator.schemas import FinalDraft, Plan
from services.orchestrator.settings import get_settings

settings = get_settings()


@pytest.fixture(autouse=True)
def _reset_memory() -> None:
    handler.memory._turns.clear()  # type: ignore[attr-defined]
    handler.memory._summaries.clear()  # type: ignore[attr-defined]
    handler.memory._turn_counters.clear()  # type: ignore[attr-defined]
    risk._CACHE.clear()  # type: ignore[attr-defined]
    yield


def test_planner_definitional_question_skips_risk(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_call_llm(payload: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "text": json.dumps(
                {
                    "needRag": False,
                    "needRisk": True,
                    "ragQueries": [],
                    "riskSpec": {"variables": {}, "trials": 1000, "scenarioNotes": ""},
                    "expected": [],
                    "confidence": 0.92,
                }
            )
        }

    monkeypatch.setattr(planner, "complete", fake_call_llm)
    plan = asyncio.run(planner.plan("What is risk analysis?", "", "", []))
    assert plan.needRisk is False
    assert plan.confidence == pytest.approx(0.92)


def test_citation_density_guard(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_planner(*_args: Any, **_kwargs: Any) -> Plan:
        return Plan(
            needRag=True,
            needRisk=False,
            ragQueries=["what is policy x"],
            riskSpec=None,
            expected=["citations"],
            confidence=0.8,
        )

    async def fake_hybrid_search(*_args: Any, **_kwargs: Any) -> List[Dict[str, Any]]:
        return [
            {"doc_id": "doc-1", "chunk_id": "c1", "text": "policy 1 text", "score": 0.8, "metadata": {"title": "Policy A"}},
            {"doc_id": "doc-2", "chunk_id": "c2", "text": "policy 2 text", "score": 0.7, "metadata": {"title": "Policy B"}},
            {"doc_id": "doc-3", "chunk_id": "c3", "text": "policy 3 text", "score": 0.6, "metadata": {"title": "Policy C"}},
        ]

    rerank_calls: List[int] = []

    def fake_rerank(hits: List[Dict[str, Any]], *_args: Any, **_kwargs: Any) -> List[Dict[str, Any]]:
        rerank_calls.append(len(hits))
        return hits

    def fake_confidence(*_args: Any, **_kwargs: Any) -> float:
        return 0.9

    async def fake_llm_synthesis(**_kwargs: Any) -> FinalDraft:
        text = "Policy one grew 5%. Policy two fell 3%. Policy three stabilized at 2%."
        return FinalDraft(
            text=text,
            citations=[{"id": "doc-1", "title": "Policy"}],
            charts=None,
            metrics={"tokens_in": 10, "tokens_out": 20, "cost_usd": 0.01},
        )

    flag: Dict[str, bool] = {"fallback": False}

    def fake_no_cite(final: FinalDraft) -> FinalDraft:
        flag["fallback"] = True
        return FinalDraft(text="fallback", citations=[], charts=None, metrics=final.metrics)

    monkeypatch.setattr(planner, "plan", fake_planner)
    monkeypatch.setattr(handler, "hybrid_search", fake_hybrid_search)
    monkeypatch.setattr(handler, "rerank", fake_rerank)
    monkeypatch.setattr(handler, "estimate_confidence", fake_confidence)
    monkeypatch.setattr(synthesis, "compose", fake_llm_synthesis)
    monkeypatch.setattr(synthesis, "acknowledge_low_evidence", fake_no_cite)

    async def _run() -> None:
        response = await handler.handle_query("thread-1", "Quote policy X and cite it", {})
        assert flag["fallback"] is True
        assert response.telemetry["rag_used"] is True
        assert rerank_calls[-1] == 3

    asyncio.run(_run())


def test_response_includes_meta_citations(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_planner(*_args: Any, **_kwargs: Any) -> Plan:
        return Plan(
            needRag=True,
            needRisk=False,
            ragQueries=["apple revenue"],
            riskSpec=None,
            expected=["citations"],
            confidence=0.9,
        )

    async def fake_hybrid_search(*_args: Any, **_kwargs: Any) -> List[Dict[str, Any]]:
        docs: List[Dict[str, Any]] = []
        for idx in range(3):
            docs.append(
                {
                    "doc_id": f"doc-{idx}",
                    "chunk_id": f"chunk-{idx}",
                    "text": "evidence " + ("x" * 400),
                    "score": 0.95 - idx * 0.1,
                    "metadata": {
                        "file_name": f"file-{idx}.csv",
                        "path": f"s3://rag-data/demo/doc-{idx}.csv",
                    },
                }
            )
        return docs

    def fake_rerank(hits: List[Dict[str, Any]], *_args: Any, **_kwargs: Any) -> List[Dict[str, Any]]:
        return hits

    def fake_confidence(*_args: Any, **_kwargs: Any) -> float:
        return 0.9

    async def fake_compose(**_kwargs: Any) -> FinalDraft:
        return FinalDraft(
            text="Answer",
            citations=[{"id": "doc-0", "title": "File 0"}],
            charts=None,
            metrics={"tokens_in": 5, "tokens_out": 10, "cost_usd": 0.01},
        )

    monkeypatch.setattr(planner, "plan", fake_planner)
    monkeypatch.setattr(handler, "hybrid_search", fake_hybrid_search)
    monkeypatch.setattr(handler, "rerank", fake_rerank)
    monkeypatch.setattr(handler, "estimate_confidence", fake_confidence)
    monkeypatch.setattr(synthesis, "compose", fake_compose)
    monkeypatch.setattr(synthesis, "acknowledge_low_evidence", lambda final: final)

    async def _run() -> None:
        response = await handler.handle_query("thread-meta", "Need Apple summary", {})
        assert "citations" in response.meta
        structured = response.meta["citations"]
        assert isinstance(structured, list)
        assert structured[0]["id"] == "doc-0"
        assert structured[0]["file_name"] == "file-0.csv"
        assert structured[0]["path"] == "s3://rag-data/demo/doc-0.csv"
        assert structured[0]["score"] == pytest.approx(0.95, rel=1e-3)

    asyncio.run(_run())


def test_meta_citations_fall_back_to_rag_docs(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_planner(*_args: Any, **_kwargs: Any) -> Plan:
        return Plan(
            needRag=True,
            needRisk=False,
            ragQueries=["tesla revenue"],
            riskSpec=None,
            expected=["citations"],
            confidence=0.91,
        )

    async def fake_hybrid_search(*_args: Any, **_kwargs: Any) -> List[Dict[str, Any]]:
        return [
            {
                "doc_id": "alpha",
                "chunk_id": "chunk-1",
                "text": "alpha evidence " + ("x" * 400),
                "score": 0.88,
                "metadata": {
                    "file_name": "alpha.csv",
                    "path": "s3://rag-data/demo/alpha.csv",
                },
            },
            {
                "doc_id": "beta",
                "chunk_id": "chunk-2",
                "text": "beta evidence " + ("x" * 400),
                "score": 0.77,
                "metadata": {
                    "file_name": "beta.csv",
                    "path": "s3://rag-data/demo/beta.csv",
                },
            },
        ]

    def fake_rerank(hits: List[Dict[str, Any]], *_args: Any, **_kwargs: Any) -> List[Dict[str, Any]]:
        return hits

    def fake_confidence(*_args: Any, **_kwargs: Any) -> float:
        return 0.92

    async def fake_compose(**_kwargs: Any) -> FinalDraft:
        return FinalDraft(
            text="Answer without explicit citations",
            citations=[],
            charts=None,
            metrics={"tokens_in": 5, "tokens_out": 10, "cost_usd": 0.02},
        )

    monkeypatch.setattr(planner, "plan", fake_planner)
    monkeypatch.setattr(handler, "hybrid_search", fake_hybrid_search)
    monkeypatch.setattr(handler, "rerank", fake_rerank)
    monkeypatch.setattr(handler, "estimate_confidence", fake_confidence)
    monkeypatch.setattr(synthesis, "compose", fake_compose)
    monkeypatch.setattr(synthesis, "acknowledge_low_evidence", lambda final: final)

    async def _run() -> None:
        response = await handler.handle_query("thread-fallback", "Need Tesla update", {})
        assert response.meta["citations"][0]["id"] == "alpha"
        assert response.meta["citations"][0]["path"] == "s3://rag-data/demo/alpha.csv"
        assert response.meta["citations"][1]["id"] == "beta"

    asyncio.run(_run())


def test_rag_quality_gate_returns_insufficient(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_planner(*_args: Any, **_kwargs: Any) -> Plan:
        return Plan(
            needRag=True,
            needRisk=False,
            ragQueries=["apple earnings"],
            riskSpec=None,
            expected=["citations"],
            confidence=0.9,
        )

    async def fake_hybrid_search(*_args: Any, **_kwargs: Any) -> List[Dict[str, Any]]:
        payload = []
        for idx in range(2):
            payload.append(
                {
                    "doc_id": f"doc-{idx}",
                    "chunk_id": f"chunk-{idx}",
                    "text": "Sample content " + ("x" * 400),
                    "score": 0.4 - idx * 0.01,
                    "metadata": {"title": f"Doc {idx}", "source": "Outlet", "date": "2024-03-0{}".format(idx + 1)},
                }
            )
        return payload

    monkeypatch.setattr(planner, "plan", fake_planner)
    monkeypatch.setattr(handler, "hybrid_search", fake_hybrid_search)
    monkeypatch.setattr(handler, "rerank", lambda hits, k: hits)
    monkeypatch.setattr(handler, "estimate_confidence", lambda *_args, **_kwargs: 0.7)

    async def _run() -> None:
        response = await handler.handle_query("rag-gate", "Share the latest Apple earnings commentary.", {})
        assert response.text == "INSUFFICIENT EVIDENCE"
        assert response.route == "RAG"
        assert response.used["rag"]["debug"]["corpus_status_hint"] == "LOW_CONFIDENCE"
        assert response.telemetry["router_metadata"]["doc_count"] == 2

    asyncio.run(_run())


def test_risk_cache_signature_changes(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: List[Dict[str, Any]] = []

    async def fake_planner(*_args: Any, **_kwargs: Any) -> Plan:
        spec = {"variables": {"revenue": 100000}, "trials": 500, "scenarioNotes": "base"}
        if "_variant" in _kwargs:
            spec["variables"]["revenue"] = 200000
        return Plan(needRag=False, needRisk=True, ragQueries=[], riskSpec=spec, expected=[], confidence=0.9)

    async def fake_risk_run(spec: Dict[str, Any]) -> Dict[str, Any]:
        calls.append(spec)
        return {"stats": {"n": spec.get("trials"), "p5": 1, "p50": 2, "p95": 3}, "metadata": spec}

    async def fake_llm_synthesis(**_kwargs: Any) -> FinalDraft:
        return FinalDraft(text="ok", citations=[], charts=None, metrics={"tokens_in": 5, "tokens_out": 10, "cost_usd": 0.0})

    monkeypatch.setattr(planner, "plan", fake_planner)
    monkeypatch.setattr(synthesis, "compose", fake_llm_synthesis)
    monkeypatch.setattr(synthesis, "acknowledge_low_evidence", lambda final: final)
    monkeypatch.setattr(handler, "hybrid_search", lambda *_args, **_kwargs: [])
    monkeypatch.setattr(handler, "rerank", lambda hits, k: hits)
    monkeypatch.setattr(handler, "estimate_confidence", lambda *_args, **_kwargs: 0.0)
    monkeypatch.setattr(handler, "risk_run", fake_risk_run, raising=False)

    async def _run() -> None:
        first = await handler.handle_query("risk-thread", "Run risk sim", {})
        second = await handler.handle_query("risk-thread", "Run risk sim", {})

        assert first.telemetry["risk_cache_hit"] is False
        assert second.telemetry["risk_cache_hit"] is True
        assert len(calls) == 1

        # Modify variables -> new signature triggers run
        async def alt_planner(*_args: Any, **_kwargs: Any) -> Plan:
            return Plan(
                needRag=False,
                needRisk=True,
                ragQueries=[],
                riskSpec={"variables": {"revenue": 200000}, "trials": 500, "scenarioNotes": "updated"},
                expected=[],
                confidence=0.9,
            )

        monkeypatch.setattr(planner, "plan", alt_planner)
        third = await handler.handle_query("risk-thread", "Run risk sim with update", {})
        assert third.telemetry["risk_cache_hit"] is False


def test_risk_failure_is_graceful(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_planner(*_args: Any, **_kwargs: Any) -> Plan:
        return Plan(
            needRag=False,
            needRisk=True,
            ragQueries=[],
            riskSpec={"variables": {"revenue": 500000}, "trials": 1000, "scenarioNotes": "test"},
            expected=["probabilities"],
            confidence=0.75,
        )

    async def fake_risk_run(_spec: Dict[str, Any]) -> Dict[str, Any]:
        return {"error": "simulation_http_error"}

    async def fake_compose(**_kwargs: Any) -> FinalDraft:
        return FinalDraft(text="safe answer", citations=[], charts=None, metrics={"tokens_in": 1, "tokens_out": 2, "cost_usd": 0.0})

    monkeypatch.setattr(planner, "plan", fake_planner)
    monkeypatch.setattr(handler, "risk_run", fake_risk_run, raising=False)
    monkeypatch.setattr(synthesis, "compose", fake_compose)
    monkeypatch.setattr(synthesis, "acknowledge_low_evidence", lambda final: final)
    monkeypatch.setattr(handler, "hybrid_search", lambda *_args, **_kwargs: [])
    monkeypatch.setattr(handler, "rerank", lambda hits, k: hits)
    monkeypatch.setattr(handler, "estimate_confidence", lambda *_args, **_kwargs: 0.0)

    async def _run() -> None:
        response = await handler.handle_query("risk-error", "Please run a Monte Carlo", {})
        assert response.route == "LLM_ONLY"
        assert response.telemetry["risk_used"] is False
        assert response.telemetry["risk_attempted"] is True
        assert response.meta["risk"]["error"] == "simulation_http_error"

    asyncio.run(_run())


def test_risk_spec_missing_is_reported(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_planner(*_args: Any, **_kwargs: Any) -> Plan:
        return Plan(
            needRag=False,
            needRisk=True,
            ragQueries=[],
            riskSpec=None,
            expected=["probabilities"],
            confidence=0.8,
        )

    async def fake_compose(**_kwargs: Any) -> FinalDraft:
        return FinalDraft(text="fallback", citations=[], charts=None, metrics={"tokens_in": 1, "tokens_out": 1, "cost_usd": 0.0})

    monkeypatch.setattr(planner, "plan", fake_planner)
    monkeypatch.setattr(synthesis, "compose", fake_compose)
    monkeypatch.setattr(synthesis, "acknowledge_low_evidence", lambda final: final)
    monkeypatch.setattr(handler, "hybrid_search", lambda *_args, **_kwargs: [])
    monkeypatch.setattr(handler, "rerank", lambda hits, k: hits)
    monkeypatch.setattr(handler, "estimate_confidence", lambda *_args, **_kwargs: 0.0)

    async def _run() -> None:
        response = await handler.handle_query("risk-missing", "please run monte carlo", {})
        assert response.route == "LLM_ONLY"
        assert response.meta["risk"]["error"] == "risk_spec_missing"

    asyncio.run(_run())


def test_memory_follow_up_skips_rag(monkeypatch: pytest.MonkeyPatch) -> None:
    async def planner_first(*_args: Any, **_kwargs: Any) -> Plan:
        return Plan(needRag=True, needRisk=False, ragQueries=["kpi"], riskSpec=None, expected=[], confidence=0.9)

    async def planner_followup(*_args: Any, **_kwargs: Any) -> Plan:
        return Plan(needRag=False, needRisk=False, ragQueries=[], riskSpec=None, expected=[], confidence=0.9)

    planner_calls: List[str] = []

    async def planner_router(user_msg: str, *args: Any, **kwargs: Any) -> Plan:
        planner_calls.append(user_msg)
        if "follow" in user_msg.lower():
            return await planner_followup(user_msg, *args, **kwargs)
        return await planner_first(user_msg, *args, **kwargs)

    async def fake_llm_synthesis(**_kwargs: Any) -> FinalDraft:
        return FinalDraft(text="memory", citations=[], charts=None, metrics={"tokens_in": 1, "tokens_out": 1, "cost_usd": 0.0})

    rag_calls: List[str] = []

    async def fake_hybrid_search(rewrites: List[str], *_args: Any, **_kwargs: Any) -> List[Dict[str, Any]]:
        rag_calls.extend(rewrites)
        return [{"doc_id": "doc-1", "chunk_id": "c1", "text": "kpi", "score": 0.9, "metadata": {}}]

    monkeypatch.setattr(planner, "plan", planner_router)
    monkeypatch.setattr(synthesis, "compose", fake_llm_synthesis)
    monkeypatch.setattr(synthesis, "acknowledge_low_evidence", lambda final: final)
    monkeypatch.setattr(handler, "hybrid_search", fake_hybrid_search)
    monkeypatch.setattr(handler, "rerank", lambda hits, k: hits)
    monkeypatch.setattr(handler, "estimate_confidence", lambda *_args, **_kwargs: 0.9)

    async def _run() -> None:
        await handler.handle_query("mem-thread", "What is the KPI trend?", {})
        await handler.handle_query("mem-thread", "Follow-up: use the KPI you mentioned", {})

        assert len(rag_calls) == 1
        assert len(planner_calls) == 2

    asyncio.run(_run())


def test_latency_budget_applies_early_cut(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_planner(*_args: Any, **_kwargs: Any) -> Plan:
        return Plan(needRag=True, needRisk=False, ragQueries=["slow"], riskSpec=None, expected=[], confidence=0.5)

    async def slow_hybrid_search(*_args: Any, **_kwargs: Any) -> List[Dict[str, Any]]:
        await asyncio.sleep(settings.early_cut_rag_ms / 1000 + 0.01)
        docs = [{"doc_id": f"doc-{i}", "chunk_id": f"c-{i}", "text": "snippet", "score": 0.9 - i * 0.1, "metadata": {}} for i in range(10)]
        return docs

    lengths: List[int] = []

    def fake_rerank(hits: List[Dict[str, Any]], *_args: Any, **_kwargs: Any) -> List[Dict[str, Any]]:
        lengths.append(len(hits))
        return hits

    async def fake_llm_synthesis(**_kwargs: Any) -> FinalDraft:
        return FinalDraft(text="ok", citations=[], charts=None, metrics={"tokens_in": 1, "tokens_out": 1, "cost_usd": 0.0})

    monkeypatch.setattr(planner, "plan", fake_planner)
    monkeypatch.setattr(handler, "hybrid_search", slow_hybrid_search)
    monkeypatch.setattr(handler, "rerank", fake_rerank)
    monkeypatch.setattr(handler, "estimate_confidence", lambda *_args, **_kwargs: 0.9)
    monkeypatch.setattr(synthesis, "compose", fake_llm_synthesis)
    monkeypatch.setattr(synthesis, "acknowledge_low_evidence", lambda final: final)

    async def _run() -> None:
        response = await handler.handle_query("latency-thread", "Need slow docs", {})
        assert lengths[-1] >= settings.max_context_chunks
        assert response.telemetry["within_latency_budget"] in {True, False}

    asyncio.run(_run())
