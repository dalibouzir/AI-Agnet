from celery import Celery

from settings import get_settings


def create_celery() -> Celery:
    settings = get_settings()
    celery_app = Celery(
        "data_tunnel",
        broker=settings.redis_url,
        backend=settings.redis_url,
        include=["workers.tasks"],
    )
    celery_app.conf.timezone = "UTC"
    celery_app.conf.task_acks_late = True
    celery_app.conf.worker_max_tasks_per_child = 100
    celery_app.conf.beat_schedule = {
        "reindex-stale": {
            "task": "workers.tasks.reindex_stale_documents",
            "schedule": 3600.0,
        }
    }
    return celery_app


celery = create_celery()
