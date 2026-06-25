"""api/v1/router.py — registers all sub-routers including new features."""
from fastapi import APIRouter
from app.api.v1.approval import router as approval_router
from app.api.v1.admin_users import router as admin_users_router
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
from app.api.v1.features import (
    calendar_router,
    dnc_router,
    import_router,
    reports_router,
    retry_router,
    scoring_router,
    slack_router,
)


from app.api.v1.outbound_webhooks import router as outbound_webhooks_router
from app.api.v1.agent_performance import router as agent_performance_router

api_router = APIRouter()

# then after api_router = APIRouter():
api_router.include_router(admin_users_router)

# Approval / role system
api_router.include_router(approval_router)

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

# Monitoring / dashboard additions
api_router.include_router(monitoring_router)
api_router.include_router(leads_router)
api_router.include_router(appointments_router)
api_router.include_router(notifications_router)
api_router.include_router(analytics_router)
api_router.include_router(audit_router)

# New feature additions (DNC, scoring, CSV import, reports, Slack, Calendar, retry queue)
api_router.include_router(dnc_router)
api_router.include_router(scoring_router)
api_router.include_router(import_router)
api_router.include_router(reports_router)
api_router.include_router(slack_router)
api_router.include_router(calendar_router)
api_router.include_router(retry_router)

# Outbound webhooks (Zapier/n8n style) + agent performance
api_router.include_router(outbound_webhooks_router)
api_router.include_router(agent_performance_router)
