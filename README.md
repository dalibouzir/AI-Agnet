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

3. **Launch the development stack**  
   ```bash
   make up
   ```
   Uses `.env` automatically and starts all containers.

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
| 📊 **Grafana** | [http://localhost:3002](http://localhost:3002) | Observability dashboards |
| 📡 **Prometheus** | [http://localhost:9090](http://localhost:9090) | Metrics store |
| 🗄️ **MinIO Console** | [http://localhost:9001](http://localhost:9001) | Object-storage UI |
| 🔎 **OpenSearch** | [http://localhost:9200](http://localhost:9200) | Vector / keyword index |
| 📊 **OpenSearch Dashboards** | [http://localhost:5601](http://localhost:5601) | Data visualization |
| 🧩 **Traefik Dashboard** | [http://localhost:80](http://localhost:80) | Service router overview |
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

Then re-upload your document to regenerate embeddings.

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

Enable real completions by setting in `.env`:
```bash
OPENAI_API_KEY=sk-xxxx
EMBEDDING_MODEL=text-embedding-3-small
```

For local setup:
```bash
USE_FAKE_EMBEDDINGS=false
OLLAMA_URL=http://ollama:11434
```

Without a key, the orchestrator falls back to deterministic summaries.

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
