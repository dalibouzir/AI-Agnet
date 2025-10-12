from contextlib import contextmanager

from pgvector.sqlalchemy import Vector
from sqlalchemy import (

    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    create_engine,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Session, sessionmaker

from pipeline.models import IngestionStatus
from settings import get_settings

_settings = get_settings()
_engine = create_engine(_settings.database_url, future=True, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=_engine, expire_on_commit=False, future=True)
_metadata = MetaData()

manifests = Table(
    "manifests",
    _metadata,
    Column("ingest_id", String, primary_key=True),
    Column("tenant_id", String, nullable=False, index=True),
    Column("source", String, nullable=False),
    Column("path", String, nullable=False),
    Column("object_key", String, nullable=False),
    Column("object_suffix", String, nullable=False),
    Column("original_basename", String, nullable=False),
    Column("doc_type", String, nullable=False),
    Column("checksum", String, nullable=False),
    Column("size", Integer, nullable=False),
    Column("mime", String, nullable=False),
    Column("uploader", String),
    Column("labels", JSONB, server_default=text("'[]'::jsonb")),
    Column("metadata", JSONB, server_default=text("'{}'::jsonb")),
    Column("created_at", DateTime, nullable=False),
)

lineage_nodes = Table(
    "lineage_nodes",
    _metadata,
    Column("node_id", String, primary_key=True),
    Column("ingest_id", String, ForeignKey("manifests.ingest_id"), nullable=False),
    Column("tenant_id", String, nullable=False, index=True),
    Column("node_type", String, nullable=False),
    Column("payload_ref", String),
    Column("created_at", DateTime, nullable=False),
)

lineage_edges = Table(
    "lineage_edges",
    _metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("parent_id", String, nullable=False),
    Column("child_id", String, nullable=False),
    Column("relation", String, nullable=False),
    Column("created_at", DateTime, nullable=False),
)

ingestions = Table(
    "ingestions",
    _metadata,
    Column("ingest_id", String, primary_key=True),
    Column("tenant_id", String, nullable=False, index=True),
    Column("status", Enum(IngestionStatus, name="ingestion_status"), nullable=False),
    Column("stage", String),
    Column("started_at", DateTime),
    Column("finished_at", DateTime),
    Column("error", Text),
    Column("dlq_reason", Text),
    Column("updated_at", DateTime),
)

chunks = Table(
    "chunks",
    _metadata,
    Column("chunk_id", String, primary_key=True),
    Column("doc_id", String, nullable=False),
    Column("tenant_id", String, nullable=False, index=True),
    Column("text", Text, nullable=False),
    Column("lang", String),
    Column("tokens", Integer),
    Column("section_path", String),
    Column("page_start", Integer),
    Column("page_end", Integer),
    Column("is_table", Integer, nullable=False, default=0),
    Column("table_ref", String),
)

vectors = Table(
    "vectors",
    _metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("chunk_id", String, ForeignKey("chunks.chunk_id"), unique=True, nullable=False),
    Column("tenant_id", String, nullable=False, index=True),
    Column("doc_id", String, nullable=False),
    Column("embedding", Vector),
    Column("metadata", JSONB, server_default="{}"),
)

dq_reports = Table(
    "dq_reports",
    _metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("ingest_id", String, nullable=False),
    Column("tenant_id", String, nullable=False),
    Column("results", JSONB, nullable=False),
    Column("created_at", DateTime, nullable=False),
)

pii_reports = Table(
    "pii_reports",
    _metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("ingest_id", String, nullable=False),
    Column("tenant_id", String, nullable=False),
    Column("results", JSONB, nullable=False),
    Column("created_at", DateTime, nullable=False),
)


def init_db() -> None:
    with _engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.execute(text("ALTER TABLE manifests ADD COLUMN IF NOT EXISTS object_key TEXT"))
        conn.execute(text("ALTER TABLE manifests ADD COLUMN IF NOT EXISTS object_suffix TEXT"))
        conn.execute(text("ALTER TABLE manifests ADD COLUMN IF NOT EXISTS original_basename TEXT"))
        conn.execute(text("ALTER TABLE manifests ADD COLUMN IF NOT EXISTS doc_type TEXT"))
        conn.execute(text("ALTER TABLE manifests ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb"))
    _metadata.create_all(_engine)


@contextmanager
def get_session() -> Session:
    session: Session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
