from celery import Celery
from app.core.config import settings

celery_app = Celery("voice_ops", broker=settings.celery_broker_url, backend=settings.celery_result_backend)
celery_app.conf.task_routes = {"app.workers.tasks.*": {"queue": "voice-ops"}}
celery_app.autodiscover_tasks(["app.workers"], related_name="tasks")
celery_app.autodiscover_tasks(["app.workers"], related_name="scheduler")
