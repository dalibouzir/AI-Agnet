import logging
from fastapi import FastAPI

from api.routers import router as api_router
from data_tunnel.webhooks import router as webhook_router
from pipeline.db import init_db
from pipeline.storage import ensure_bucket
from pipeline.index import ensure_index_template

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

app = FastAPI(title="Data Engineering Tunnel")
app.include_router(api_router)
app.include_router(webhook_router)


@app.on_event("startup")
def startup_event() -> None:
    init_db()
    ensure_bucket()
    ensure_index_template()


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
