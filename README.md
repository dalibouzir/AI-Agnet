# 🧠 AI Business Agent

Monorepo scaffold for an **AI-assisted business operations stack** combining orchestration, retrieval, simulation, and UI layers.  
Everything here is a runnable stub waiting for real integrations.

---

## 🚀 Getting Started

1. **Copy environment defaults**  
   ```bash
   cp .env.example .env
   ```

2. **Ensure OpenSearch kernel map limit (run once per reboot)**  
   ```bash
   make sysctl
   ```

3. **Launch the core development stack**  
   ```bash
   make up
   ```
   Spins up Postgres, Redis, MinIO, OpenSearch, data tunnel, the GPT‑4o backed LLM API, orchestration services, sim engine, router, and the web UI.

4. **(Optional) Bring up specialized services**
   ```bash
   make up-ingest          # starts the Celery ingest worker
   make up-observability   # starts Grafana/Prometheus/Traefik/exporters dashboards
   ```
   Optional containers live behind Compose profiles so you only download them when needed.

---

## 🌐 Services & URLs

| Service | URL | Description |
|----------|-----|-------------|
| 🧠 **Orchestrator API** | [http://localhost:8001](http://localhost:8001) | Central logic / routing |
| 🔍 **RAG API** | [http://localhost:8002](http://localhost:8002) | Retrieval & grounding |
| ✍️ **LLM API** | [http://localhost:8003](http://localhost:8003) | Text generation & summarization |
| 📈 **Simulation API** | [http://localhost:8004](http://localhost:8004) | Monte Carlo simulations |
| 🧭 **Router API** | [http://localhost:8005](http://localhost:8005) | Intent classification router |
| 📂 **Data Tunnel API** | [http://localhost:8006](http://localhost:8006) | File ingestion pipeline |
| 💻 **Web UI** | [http://localhost:3001](http://localhost:3001) | Front-end dashboard |
| 📊 **Grafana** | [http://localhost:3002](http://localhost:3002) | Observability dashboards *(observability profile)* |
| 📡 **Prometheus** | [http://localhost:9090](http://localhost:9090) | Metrics store *(observability profile)* |
| 🗄️ **MinIO Console** | [http://localhost:9001](http://localhost:9001) | Object-storage UI |
| 🔎 **OpenSearch** | [http://localhost:9200](http://localhost:9200) | Vector / keyword index |
| 📊 **OpenSearch Dashboards** | [http://localhost:5601](http://localhost:5601) | Data visualization *(observability profile)* |
| 🧩 **Traefik Dashboard** | [http://localhost:80](http://localhost:80) | Service router overview *(observability profile)* |
| 🧰 **Redis** | `tcp://localhost:6379` | Queue backend |
| 🗃️ **Postgres (pgvector)** | `tcp://localhost:5432` | Main database |

---

## 🔄 RAG Ingestion & Embedding Pipeline

Uploads land in **MinIO** via the `data-tunnel` API, which writes a manifest to **Postgres** before the **Celery worker** picks up the job.

The worker runs staged tasks:

```
parse_normalize → pii_dq → enrich → chunk_embed → index_publish
```

- `chunk_embed` → creates text chunks and embeddings  
- `index_publish` → saves them to **OpenSearch**

### ⚠️ Notes
- The PII redaction stage uses **Microsoft Presidio**.  
- If its spaCy model is missing or fails to download, the worker exits early → only manifests are saved (no embeddings).

#### 🧩 Fix options
Add this to your `data-tunnel` Dockerfile:
```bash
RUN python -m spacy download en_core_web_sm
```
Or temporarily remove Presidio from  
`services/data-tunnel/requirements.txt`.

Afterward, rebuild and restart:
```bash
docker compose build data-tunnel data-tunnel-worker
docker compose restart data-tunnel data-tunnel-worker
```

If Postgres data is wiped, recreate the ingestion tables before starting the service:
```bash
./scripts/bootstrap_data_tunnel_db.sh
```

Then re-upload your document to regenerate embeddings.

### ✅ RAG Health Check

Use the helper script to verify OpenSearch holds your chunks:
```bash
./scripts/check_rag_index.sh              # defaults to http://localhost:9200 rag-chunks
# or specify host/index
./scripts/check_rag_index.sh http://localhost:9200 rag-chunks
```
If the count is `0`, rebuild the index after ensuring documents exist in MinIO:
```bash
# Re-run the indexing helper (replace with your dataset builder)
python services/rag/build_index_phrasebank.py
# or for custom data, invoke your ingestion script then:
./scripts/check_rag_index.sh
```
Once chunks exist, the orchestrator will refuse to hallucinate and instead say “Not found in context” until citations are available.

### ♻️ Rebuild embeddings after updating providers

If you swap embedding providers (e.g., moving from Ollama to OpenAI) re-run the ingest pipeline for any previously stuck manifests:
```bash
# Rebuild the worker image so it picks up config changes
docker compose up -d --build infra-data-tunnel infra-data-tunnel-worker

# (Optional) rebuild RAG to keep dims/model metadata aligned
docker compose up -d --build infra-rag

# Requeue manifests that are waiting in chunk_embed/index_publish
docker exec -it infra-data-tunnel-worker-1 \
  python -m pipelines.index_publish --tenant tenant-demo
```
Watch worker logs to confirm new embeddings are generated:
```bash
docker logs -f infra-data-tunnel-worker-1 | grep embeddings
```
Expected entries reference the OpenAI model (e.g., `text-embedding-3-small`) instead of `ollama`.

---

## 🔍 OpenSearch Notes

**Default credentials:**
```
Username: admin
Password: adminadmin
```
(Change in `.env` → `OPENSEARCH_INITIAL_ADMIN_PASSWORD`)

- Host access: [http://localhost:9200](http://localhost:9200)  
- Container access: `http://opensearch:9200`

If OpenSearch fails to start:
```bash
make sysctl
docker compose logs opensearch
```

---

## 🤖 LLM Notes

By default the stack ships with `LLM_PROVIDER=openai` and `MODEL_NAME=ft:gpt-4o-mini-2024-07-18:esprit:ai-business-agent-v1:CaIy8Jh2`.  
To change models/providers:
```bash
# .env / infra/.env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
MODEL_NAME=ft:gpt-4o-mini-2024-07-18:esprit:ai-business-agent-v1:CaIy8Jh2

# optional overrides
WRITER_MODEL=<model for long-form responses>
CLASSIFIER_MODEL=<router override>

cd infra
docker compose up -d llm-api orchestrator router
```

The `llm-api` gateway is stateless: prompts stream to the configured provider (OpenAI by default), nothing is persisted, and there is **no on-the-fly training**.  
If you later connect Ollama/HF, set the provider env vars and restart only the `llm-api` service.

---

### 🗂️ Weekly chat snapshots

Capture transcripts for fine-tuning with:

```bash
make snapshot-chat
```

The task copies `apps/web/logs/chat-transcripts.jsonl` to `datasets/chat/chat-<date>.jsonl`. Add it to `cron` (`0 1 * * 1 make snapshot-chat`) so you always have a fresh supervised dataset.

### 🎯 Fine-tuning notebook

Use `notebooks/finance_finetune.ipynb` to:

- Load chat transcripts and build instruction datasets
- Configure LoRA adapters for Qwen or Llama checkpoints
- Launch PEFT training and export adapters for Ollama (`ollama create finance-writer --adapter …`)

Review evaluation loss and run a manual hallucination sweep before swapping adapters into production.

---

## 🧹 Resetting the stack for fresh data

When you are ready to swap test fixtures for production uploads run the following sequence:

```bash
cd infra
docker compose down

# wipe Next.js build cache so the web UI rebuilds cleanly
rm -rf ../apps/web/.next

# rebuild services
docker compose up -d --build

# clean MinIO + recreate rag-data bucket
docker compose exec minio sh -lc 'mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"'
docker compose exec minio sh -lc 'mc rm -r --force local/rag-data || true'
docker compose exec minio sh -lc 'mc mb local/rag-data || true'

# truncate ingestion tables
docker compose exec db psql -U app -d appdb \
  -c "TRUNCATE TABLE vectors, chunks, dq_reports, pii_reports, lineage_edges, lineage_nodes, manifests, ingestions RESTART IDENTITY CASCADE;"

# drop any lingering OpenSearch data and recreate the template
curl -XDELETE http://localhost:9200/rag-chunks || true
docker compose exec data-tunnel python -c "from pipeline.index import ensure_index_template; ensure_index_template()"

# rebuild SQL metadata (safe to run repeatedly)
cd ..
./scripts/bootstrap_data_tunnel_db.sh
```

After this reset the `/upload` view is empty and ready for new documents.

Or point at OpenAI / HF:
```bash
OPENAI_API_KEY=sk-xxxx
LLM_PROVIDER=openai
MODEL_NAME=ft:gpt-4o-mini-2024-07-18:esprit:ai-business-agent-v1:CaIy8Jh2
```

Without a real provider, the orchestrator and writer services continue to respond using the profile template with clearly labelled placeholder content.

Adjust limits:
```bash
LLM_MAX_PROMPT_CHARS=4000
LLM_MAX_CONTEXT_CHUNKS=5
```

---

## 🧠 Health Checks

Check service health:
```bash
curl http://localhost:8001/health   # Orchestrator
curl http://localhost:8002/health   # RAG
curl http://localhost:8003/health   # LLM
curl http://localhost:8004/health   # Simulation
curl http://localhost:8005/health   # Router
curl http://localhost:8006/health   # Data Tunnel
```

Expected output:
```json
{"status": "ok"}
```

---

## 📦 Check Chunks in OpenSearch

### 1️⃣ View stored chunks
```bash
curl -s 'http://localhost:9200/rag-chunks/_search?size=5' \
  -H 'Content-Type: application/json' \
  -u admin:adminadmin \
  -d '{
    "_source": ["text","metadata.doc_type","metadata.source","embedding"],
    "query": { "match_all": {} }
  }' | jq
```

### 2️⃣ Verify index mapping (embedding dimension)
```bash
curl -s -u admin:adminadmin http://localhost:9200/rag-chunks/_mapping | jq
```

Expected output:
```json
"embedding": { "type": "knn_vector", "dimension": 768 }
```

---

## 🧾 Logs & Monitoring

Watch ingestion pipeline in real time:
```bash
docker compose logs -f data-tunnel-worker
```

Look for:
```
[worker] Parsing file ...
[worker] Chunking 42 blocks
[worker] Generating embeddings ...
[worker] Indexed 42 chunks into OpenSearch
```

Check running containers:
```bash
docker compose ps
```

---

## 🧰 Debugging Tips

| Problem | Likely Cause | Quick Fix |
|----------|---------------|-----------|
| `vector length: 0 or VALUE_NULL after [vector]` | Missing or fake embeddings / dimension mismatch | Ensure `USE_FAKE_EMBEDDINGS=true` and `FAKE_EMBEDDING_DIM` matches index dim (768 or 1536), or enable real model + API key. |
| Worker stops after PII stage | Missing spaCy model for Presidio | Add `RUN python -m spacy download en_core_web_sm` or remove Presidio. |
| OpenSearch fails to start | Kernel map limit too low or bad credentials | Run `make sysctl` and check logs. |
| RAG returns irrelevant chunks | Fake embeddings enabled | Set `USE_FAKE_EMBEDDINGS=false` and configure real embedding model. |

---

## ✅ Acceptance Criteria

- `make up` starts the full stack with no errors  
- Each service returns `/health → {"status": "ok"}`  
- `apps/web` renders correctly  
- RAG + LLM + Simulation + Orchestrator communicate end-to-end  

---

## 🎯 Next Steps

- Replace stub endpoints with real business logic  
- Integrate secure LLM / Ollama backends  
- Add hybrid retrieval & performance metrics  
- Expand ingestion telemetry & DLQ handling  

---

**✅ Ready to use!**  
Save this as `README.md` in the root of your repo — it’s fully Markdown-compliant, styled for GitHub, and includes all your real service ports, health checks, and debugging commands.
