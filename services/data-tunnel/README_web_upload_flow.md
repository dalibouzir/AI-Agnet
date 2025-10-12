# Web Upload Ingestion Flow

This service now applies a consistent end-to-end ingestion pipeline for
uploads originating from the web console or direct API calls.

1. **Upload**  
   `POST /v1/ingest` writes the raw asset into MinIO at
   `s3://documents/<tenant>/<ingest_id>/raw/<filename>` and persists the
   resolved ingest options (PII, DQ, etc.) alongside the manifest.

2. **PII + DQ defaults**  
   Unless the caller specifies overrides, the following options are merged
   into the request:

   ```json5
   {
     "dq": {
       "language_detect": true,
       "pii": {
         "action": "redact",
         "policy": "presidio",
         "mask": "[REDACTED]"
       }
     },
     "ingest": {
       "continue_on_warn": true,
       "fail_on_pii": false
     }
   }
   ```

3. **PII redaction**  
   `pii_dq` uses Presidio to detect entities, masks them when `action ==
   "redact"`, stores the redacted text at
   `s3://documents/<tenant>/<ingest_id>/redacted/<filename>.txt`, and records
   the outcome in the manifest metadata. Jobs only fail when the policy
  `action` is `fail` or `ingest.fail_on_pii` is set.

4. **DQ checks**  
   Reports are persisted even when warnings are tolerated. The pipeline
   continues when `ingest.continue_on_warn` is true.

5. **Chunk / Embed / Index**  
   Semantic chunks (deterministic IDs) are embedded using 1536 dimensional
   vectors and indexed into OpenSearch `rag-chunks` with the matching k-NN
   mapping.

6. **Status**  
   Successful runs always settle on `status=COMPLETED` and `stage=index_publish`.

### Smoke test

```bash
./scripts/smoke_ingest.sh /path/to/document.pdf
```

The script uploads a file without custom options, waits for completion, and
asserts that OpenSearch contains the new chunks.
