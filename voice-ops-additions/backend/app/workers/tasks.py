from app.workers.celery_app import celery_app

@celery_app.task(name="app.workers.tasks.sync_provider_events")
def sync_provider_events() -> dict:
    return {"status": "scheduled"}
