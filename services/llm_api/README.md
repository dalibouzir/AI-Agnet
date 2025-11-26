# LLM API Service

FastAPI service that wraps the local Ollama runtime for both embeddings and text generation.

## Endpoints

- `POST /embed` &rarr; deterministic embeddings used by the RAG + pgvector pipeline.
- `POST /v1/generate` &rarr; non-streaming completions sent to Ollama (`/api/generate`).
- `POST /complete` &rarr; backwards-compatible wrapper around `/v1/generate`.
- `GET /health` &rarr; simple readiness probe.

## Environment

| Variable | Default | Description |
| --- | --- | --- |
| `OLLAMA_URL` | `http://llama:11434/api/generate` | Target Ollama endpoint. |
| `OLLAMA_MODEL` | `llama3.1:8b-instruct` | Default model identifier to request. |
| `OLLAMA_TIMEOUT_S` | `120` | Timeout for generation calls. |
| `OLLAMA_KEEP_ALIVE` | `5m` | Keep-alive setting to avoid cold starts. |
| `LLM_MAX_TOKENS` | `512` | Default max tokens for completions. |

Ensure the `llama` service pulls the base model once before starting the stack:

```bash
docker compose run --rm llama ollama pull llama3.1:8b-instruct
curl -s http://localhost:11434/api/tags | jq '.models[]?.model'
```

The Docker image exposes port `8000`; in `docker-compose.yml` it is mapped to host port `8003`.
