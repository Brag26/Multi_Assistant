"""api/v1/router.py — registers all sub-routers."""
from fastapi import APIRouter

from app.api.v1 import (
    analytics,
    appointments,
    audit_logs,
    calls,
    campaigns,
    contacts,
    integrations,
    notifications,
    webhooks,
    workflows,
)
from app.api.v1.monitoring import (
    analytics_router,
    appointments_router,
    audit_router,
    leads_router,
    monitoring_router,
    notifications_router,
)

api_router = APIRouter()

# Existing routers
api_router.include_router(workflows.router)
api_router.include_router(campaigns.router)
api_router.include_router(contacts.router)
api_router.include_router(calls.router)
api_router.include_router(integrations.router)
api_router.include_router(webhooks.router)
api_router.include_router(notifications.router)
api_router.include_router(appointments.router)
api_router.include_router(analytics.router)
api_router.include_router(audit_logs.router)

# New routers from monitoring module
api_router.include_router(monitoring_router)
api_router.include_router(leads_router)
api_router.include_router(appointments_router)
api_router.include_router(notifications_router)
api_router.include_router(analytics_router)
api_router.include_router(audit_router)
