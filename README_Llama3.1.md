# Llama 3.1 8B Integration Playbook

End-to-end guide for wiring **Llama 3.1 8B Instruct** into the AI Business Agent stack. Covers infra, services, UI, observability, dataset prep, validation, and post-launch improvements.

---

## Stage 0 – Preflight

| Checkpoint | Command |
| --- | --- |
| Compose stack status | `docker compose -f infra/docker-compose.yml ps` |
| GPU availability (if present) | `nvidia-smi || echo "No NVIDIA GPU detected"` |
| Inter-service DNS | `docker exec infra_orchestrator_1 getent hosts llm-api rag sim` |
| Prometheus targets | `curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[].labels.job'` |

If any service is down, run:
```bash
cd infra
docker compose up -d
```

---

## Stage 1 – Ollama Model Server

1. **Service definition** (`infra/docker-compose.yml`)
   ```yaml
   llama:
     image: ollama/ollama:latest
     restart: unless-stopped
     ports:
       - "11434:11434"
     volumes:
       - ollama:/root/.ollama
     healthcheck:
       test: ["CMD", "ollama", "list"]
   ```
2. **Pull the base model** (one time):
   ```bash
   cd infra
   docker compose run --rm llama ollama pull llama3.1:8b-instruct
   ```
3. **Verify registry**:
   ```bash
   curl -s http://localhost:11434/api/tags | jq '.models[].model'
   ```

---

## Stage 2 – LLM API Microservice (`services/llm_api`)

| Endpoint | Description |
| --- | --- |
| `POST /embed` | Deterministic embeddings (1536-dim) for RAG |
| `POST /v1/generate` | Non-streaming Ollama completions |
| `POST /complete` | Legacy wrapper around `/v1/generate` |
| `GET /health` | Readiness probe |

Env vars:
```env
OLLAMA_URL=http://llama:11434/api/generate
OLLAMA_MODEL=llama3.1:8b-instruct
LLM_MAX_TOKENS=640
```

> **Model enforcement.** The LLM API now hard-requires the fine-tuned model `ft:gpt-4o-mini-2024-07-18:esprit:ai-business-agent-v1`. Requests that specify any other model return `ERROR: MODEL_NOT_ALLOWED` and skip generation. All completion responses include a `metadata` object with `model_id`, `decoding`, `tokens_in`, and `tokens_out` so downstream services can answer "which model replied?" without extra calls.

Health check:
```bash
curl http://localhost:8003/health
```

Sample completion:
```bash
curl -s http://localhost:8003/v1/generate \
  -H 'content-type: application/json' \
  -d '{"prompt":"Summarize our Q3 board update.","max_tokens":256}'
```

---

## Stage 3 – Router / Intent Classifier

*Endpoint:* `POST orchestrator:8001/v1/classify`

Few-shot prompt routes between **rag**, **risk**, and **llm**.  
Metrics: `router_classifications_total`, `router_classifier_confidence`.

Prompt text lives on disk at `prompts/router_system_prompt.txt` (mounted into the orchestrator container for easy tweaking without rebuilds).

Manual smoke test:
```bash
curl -s http://localhost:8001/v1/classify -H 'content-type: application/json' -d '{"query":"Draft a welcome note for the new VP of Ops"}'
curl -s http://localhost:8001/v1/classify -H 'content-type: application/json' -d '{"query":"Summarize the latest revenue KPIs"}'
curl -s http://localhost:8001/v1/classify -H 'content-type: application/json' -d '{"query":"Run a Monte Carlo for 15% churn"}'
```

Each decision is logged as:
```
ROUTER_DECISION    {"query": "...", "mode": "...", "confidence": 0.91, "reason": "..."}
```

Use `scripts/export_datasets.py` to materialise datasets later.

---

## Stage 4 – Unified Query Flow (`/v1/query`)

Pipeline inside orchestrator:

1. `POST /v1/classify`
2. `mode == "rag"` → `POST rag:8002/v1/retrieve`
3. `mode == "risk"` → `POST sim:8004/v1/run`
4. Compose final prompt + send to `llm-api`
5. Emit structured response:
   ```json
   {
     "mode": "rag",
     "text": "...",
     "citations": [...],
     "charts": [...],
     "usage": { "total_tokens": 418, "model": "llama3.1:8b-instruct" },
     "timings": { "total_s": 2.43 }
   }
   ```
6. Writer samples logged with:
   ```
   WRITER_SAMPLE {"query": "...", "mode": "...", "text": "...", ...}
   ```

> **RAG-first guardrails.** Company/financial/news requests now force RAG retrieval (top_k=10, or 12 for short prompts) with chunk filtering (`min_chars=300`), date bias since 2024-01-01 when the user says "latest/recent/since", and Apple-specific query expansion. The answer only proceeds when ≥3 distinct documents exceed score 0.35; otherwise the user receives `INSUFFICIENT EVIDENCE` plus a debug payload `{top_scores, matched_titles, corpus_status_hint}` and router metadata (`route/top_k/threshold/doc_count/max_score`). Successful RAG responses follow a fixed structure (Executive Summary, Evidence Table, Quotes, Citations, Router Metadata) so downstream consumers can parse evidence consistently.

Verification prompt (exercises both the model enforcer and the RAG quality gate):
```
Show me an Apple earnings trend summary since 2024-01-01 using RAG only. Require ≥3 citations with scores ≥0.35 from distinct outlets. If this condition fails, return INSUFFICIENT EVIDENCE with {top_scores, matched_titles, corpus_status_hint}. Also return model_id used to generate the final text.
```

Smoke test:
```bash
curl -s http://localhost:8001/v1/query \
  -H 'content-type: application/json' \
  -d '{"query":"What changed in the Q3 board packet?"}' | jq
```

---

## Stage 5 – UI Enhancements

* `/api/chat` proxy updated to call `/v1/query`.
* Chat pane appends routing metadata (mode, latency, tokens).
* Side panel renders:
  - Router rationale + confidence
  - Citations (doc / chunk / snippet)
  - Simulation chart previews (JSON snippets)
  - Loading indicator while awaiting orchestrator

Hot reload: `cd apps/web && npm run dev`

---

## Stage 6 – RAG Integration

*New endpoint:* `POST rag:8002/v1/retrieve`

```json
{
  "query": "liquidity plan",
  "top_k": 5,
  "chunks": [
    {
      "doc_id": "s3://kb/board/q3.pdf",
      "chunk_id": "a3f7...",
      "text": "...",
      "score": 0.82,
      "metadata": { "title": "Q3 board deck" }
    }
  ],
  "usage": { "vector_dim": 1536, "retrieved": 5, "index": "rag-chunks" }
}
```

Verification:
```bash
curl -s http://localhost:8002/v1/retrieve \
  -H 'content-type: application/json' \
  -d '{"query":"cash runway outlook","top_k":3}' | jq '.chunks[].doc_id'
```

---

## Stage 7 – Monte Carlo Simulation

Endpoint: `POST sim:8004/v1/run`

Request:
```json
{
  "prompt": "Estimate downside ARR impact with 15% churn increase",
  "trials": 5000
}
```

Response payload:
* `stats`: mean / median / p10 / p90 values, change %, downside probability
* `charts`: histogram bins for plotting
* `metadata`: seed, whether drivers were auto-generated, floors / ceilings

Risk mode prompts enforce sections: **Executive Summary**, **Why It Matters**, **Next Best Actions**.

---

## Stage 8 – Fine-tuning Preparation

1. **Collect datasets**  
   ```bash
   docker compose logs orchestrator > orchestrator.log
   python scripts/export_datasets.py orchestrator.log --output-dir datasets
   ```
   Produces:
   - `datasets/router_dataset.jsonl` (1–3k labelled queries)
   - `datasets/writer_dataset.jsonl` (high-quality responses)

2. **Train LoRA adapters** (example with `qlora` tooling):
   ```bash
   accelerate launch train_router.py \
     --base-model llama3.1:8b-instruct \
     --dataset datasets/router_dataset.jsonl \
     --output models/adapters/llama3.1-8b-router
   ```

3. **Register adapters with Ollama**
   ```bash
  ollama create llama3.1-8b-router --from llama3.1:8b-instruct --adapter models/adapters/llama3.1-8b-router
   ollama create llama3.1-8b-writer --from llama3.1:8b-instruct --adapter models/adapters/llama3.1-8b-writer
   ```

4. **Hot-swap via env**
   ```env
   CLASSIFIER_MODEL=llama3.1-8b-router
   ROUTER_ADAPTER=llama3.1-8b-router
   WRITER_MODEL=llama3.1-8b-writer
   WRITER_ADAPTER=llama3.1-8b-writer
   ```
   Restart `llm-api` + `orchestrator`.

---

## Stage 9 – Observability

Prometheus metrics exposed on each FastAPI service:

| Metric | Labels | Notes |
| --- | --- | --- |
| `query_mode_total` | `mode` | Route distribution |
| `llm_latency_seconds` | `mode` | Downstream LLM latency histogram |
| `tokens_used_total` | `type` (prompt/completion/total) | Token accounting |
| `router_classifications_total` | `mode` | Intent counts |
| `router_classifier_confidence` | — | Confidence histogram |

Add Grafana dashboards (PromQL examples):
```promql
sum by (mode)(rate(query_mode_total[5m]))
histogram_quantile(0.95, sum by (le, mode)(rate(llm_latency_seconds_bucket[5m])))
sum(rate(tokens_used_total{type="total"}[5m]))
```

Audit logging: use `scripts/export_datasets.py` output as audit trail per tenant (add tenant metadata to logs if required).

---

## Stage 10 – Validation & Rollout Checklist

1. **Routing accuracy**: Run ≥20 mixed prompts (LLM / RAG / risk) → target >90% correct mode.  
2. **Citation audit**: Confirm response contains citation markers referencing retrieved chunks.  
3. **Risk narrative**: Ensure sections include required headings.  
4. **Latency baselines** (record p50/p95):
   ```bash
   curl -s http://localhost:8001/v1/query ... | jq '.timings'
   ```
5. **Tokens & cost**: Review Prometheus counters before/after batch.  
6. **UI smoke**: Submit prompts via Next.js console, confirm loading indicator and insights panel update.  
7. **Backup**: Snapshot `models/adapters/` (e.g., push to object storage).  
8. **Deploy notes**: Update `.env`, restart services, run `docker compose ps` to confirm.

---

## Stage 11 – Post-launch Enhancements

1. **Feedback loop**  
   - Add thumbs up/down to chat UI → POST feedback API.  
   - Store interactions alongside writer datasets for RLHF / DPO.

2. **Auto retraining**  
   - Schedule dataset export via cron (`scripts/export_datasets.py`), push to model training pipeline every N weeks.  
   - Version adapters with semantic tags (`llama3.1-8b-writer-v2`).

3. **Performance upgrades**  
   - Introduce [vLLM](https://github.com/vllm-project/vllm) or SGLang for high-throughput serving.  
   - Benchmark vs Ollama (latency, tokens/s).  
   - Optionally shard RAG across pgvector + OpenSearch hybrid retrieval.

4. **Governance**  
   - Add tenant ID + prompt hash to `WRITER_SAMPLE` log payloads.  
   - Mirror logs to a long-term bucket / SIEM for audits.

---

## Appendix A – CLI Quick Reference

```bash
# Classify intent
http POST :8001/v1/classify query=="What is our current burn multiple?"

# Unified query (RAG)
http POST :8001/v1/query query=="Summarize liquidity in the Q3 board packet"

# Unified query (force mode)
http POST :8001/v1/query query=="Draft customer apology" mode_hint==llm

# Retrieve top-k chunks
http POST :8002/v1/retrieve query=="cash runway"

# Run Monte Carlo
http POST :8004/v1/run prompt=="Monte Carlo liquidity stress test"

# Generate dataset files
docker compose logs orchestrator | python scripts/export_datasets.py --output-dir datasets
```

---

**Deliverable goal:** an intelligent router that blends direct answers, RAG-grounded insights, and Monte Carlo simulations—all powered by Llama 3.1 8B with adapter hooks ready for fine-tuning. Continuous observability, dataset tooling, and rollout guidance are in place for production-readiness.
