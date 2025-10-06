from datetime import datetime
from typing import Optional
import uuid

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from pipeline.db import get_session, ingestions, lineage_edges, lineage_nodes
from pipeline.models import IngestionStatus


def record_node(ingest_id: str, tenant_id: str, node_type: str, payload_ref: Optional[str] = None) -> str:
    node_id = str(uuid.uuid4())
    with get_session() as session:
        session.execute(
            lineage_nodes.insert().values(
                node_id=node_id,
                ingest_id=ingest_id,
                tenant_id=tenant_id,
                node_type=node_type,
                payload_ref=payload_ref,
                created_at=datetime.utcnow(),
            )
        )
    return node_id


def record_edge(parent_id: str, child_id: str, relation: str) -> None:
    with get_session() as session:
        session.execute(
            lineage_edges.insert().values(
                parent_id=parent_id,
                child_id=child_id,
                relation=relation,
                created_at=datetime.utcnow(),
            )
        )


def update_status(
    ingest_id: str,
    tenant_id: str,
    status: IngestionStatus,
    stage: Optional[str] = None,
    error: Optional[str] = None,
    dlq_reason: Optional[str] = None,
    started_at: Optional[datetime] = None,
    finished_at: Optional[datetime] = None,
) -> None:
    insert_values = {
        "ingest_id": ingest_id,
        "tenant_id": tenant_id,
        "status": status.value,
        "stage": stage,
        "error": error,
        "dlq_reason": dlq_reason,
        "updated_at": datetime.utcnow(),
    }
    update_fields = {
        "status": status.value,
        "stage": stage,
        "error": error,
        "dlq_reason": dlq_reason,
        "updated_at": datetime.utcnow(),
    }

    if started_at is not None:
        insert_values["started_at"] = started_at
        update_fields["started_at"] = started_at
    if finished_at is not None:
        insert_values["finished_at"] = finished_at
        update_fields["finished_at"] = finished_at

    stmt = pg_insert(ingestions).values(**insert_values)

    stmt = stmt.on_conflict_do_update(
        index_elements=[ingestions.c.ingest_id],
        set_=update_fields,
    )

    with get_session() as session:
        session.execute(stmt)
        session.commit()


def stage_completed(ingest_id: str, stage: str) -> bool:
    stmt = select(lineage_nodes.c.node_id).where(
        lineage_nodes.c.ingest_id == ingest_id,
        lineage_nodes.c.node_type == f"stage:{stage}:completed",
    )
    with get_session() as session:
        return session.execute(stmt).first() is not None


def transition_processing(ingest_id: str, tenant_id: str, stage: str) -> None:
    update_status(
        ingest_id,
        tenant_id,
        IngestionStatus.PROCESSING,
        stage=stage,
        started_at=datetime.utcnow(),
    )


def transition_completed(ingest_id: str, tenant_id: str) -> None:
    update_status(
        ingest_id,
        tenant_id,
        IngestionStatus.COMPLETED,
        stage="index_publish",
        finished_at=datetime.utcnow(),
    )


def transition_failed(ingest_id: str, tenant_id: str, stage: str, reason: str) -> None:
    update_status(
        ingest_id,
        tenant_id,
        IngestionStatus.FAILED,
        stage=stage,
        error=reason,
        dlq_reason=reason,
        finished_at=datetime.utcnow(),
    )


def mark_stage_complete(ingest_id: str, tenant_id: str, stage: str, payload_ref: Optional[str] = None) -> None:
    if not stage_completed(ingest_id, stage):
        record_node(ingest_id, tenant_id, f"stage:{stage}:completed", payload_ref=payload_ref)
