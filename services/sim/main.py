from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator

app = FastAPI(title="Simulation (Stub)")
Instrumentator().instrument(app).expose(app)

@app.get("/health")
def health():
    return {"status": "ok"}
