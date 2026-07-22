"""core/features.py — master catalog of features superadmin can grant/hide.

Keys match the frontend nav item hrefs (without the leading slash) so the
sidebar can filter directly against them. ALWAYS_VISIBLE features never need
an explicit grant — every role sees them regardless of feature_access rows.
"""

ALWAYS_VISIBLE = {"dashboard", "calls", "campaigns", "contacts", "billing", "settings", "integrations", "support"}

FEATURE_CATALOG: list[dict] = [
    {"key": "dashboard", "label": "Dashboard", "group": "Overview"},
    {"key": "analytics", "label": "Analytics", "group": "Overview"},
    {"key": "reports", "label": "Reports", "group": "Overview"},
    {"key": "workflows", "label": "Workflows", "group": "Automation"},
    {"key": "workflows/wizard", "label": "Smart Wizard", "group": "Automation"},
    {"key": "agents", "label": "AI Agents", "group": "Automation"},
    {"key": "workflows/templates", "label": "Templates", "group": "Automation"},
    {"key": "monitoring", "label": "Call Monitor", "group": "Automation"},
    {"key": "webhooks", "label": "Webhooks", "group": "Automation"},
    {"key": "leads", "label": "Leads", "group": "CRM"},
    {"key": "contacts", "label": "Contacts", "group": "CRM"},
    {"key": "lead-scoring", "label": "Lead Scoring", "group": "CRM"},
    {"key": "appointments", "label": "Appointments", "group": "CRM"},
    {"key": "dnc", "label": "DNC List", "group": "CRM"},
    {"key": "leadgen", "label": "Lead Generation (Apify)", "group": "CRM"},
    {"key": "campaigns", "label": "Campaigns", "group": "Operations"},
    {"key": "calls", "label": "Calls", "group": "Operations"},
    {"key": "agent-performance", "label": "Leaderboard", "group": "Operations"},
    {"key": "notifications", "label": "Notifications", "group": "Operations"},
    {"key": "integrations", "label": "Integrations", "group": "Admin"},
    {"key": "billing", "label": "Billing", "group": "Admin"},
    {"key": "audit-logs", "label": "Audit Logs", "group": "Admin"},
]
