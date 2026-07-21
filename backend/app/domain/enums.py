from enum import StrEnum


class WorkflowStatus(StrEnum):
    DRAFT    = "draft"
    ACTIVE   = "active"
    PAUSED   = "paused"
    ARCHIVED = "archived"


class CampaignStatus(StrEnum):
    DRAFT     = "draft"
    SCHEDULED = "scheduled"
    RUNNING   = "running"
    PAUSED    = "paused"
    COMPLETED = "completed"
    CANCELED  = "canceled"


class CallStatus(StrEnum):
    QUEUED      = "queued"
    IN_PROGRESS = "in_progress"
    COMPLETED   = "completed"
    FAILED      = "failed"
    CANCELED    = "canceled"


class CallOutcome(StrEnum):
    UNKNOWN           = "unknown"
    QUALIFIED         = "qualified"
    NOT_INTERESTED    = "not_interested"
    CALLBACK_REQUESTED = "callback_requested"
    ESCALATED         = "escalated"
    FAILED            = "failed"


class IntegrationProvider(StrEnum):
    VAPI   = "vapi"
    TWILIO = "twilio"
    MAKE   = "make"
    APIFY  = "apify"


class LeadStatus(StrEnum):
    NEW       = "new"
    CONTACTED = "contacted"
    QUALIFIED = "qualified"
    NURTURING = "nurturing"
    CONVERTED = "converted"
    LOST      = "lost"


class AppointmentStatus(StrEnum):
    SCHEDULED = "scheduled"
    COMPLETED = "completed"
    CANCELED  = "canceled"


class BillingPlan(StrEnum):
    STARTER    = "starter"
    GROWTH     = "growth"
    PRO        = "pro"
    ENTERPRISE = "enterprise"


class SubscriptionStatus(StrEnum):
    TRIALING = "trialing"
    ACTIVE   = "active"
    PAST_DUE = "past_due"
    CANCELED = "canceled"
    EXPIRED  = "expired"


class PaymentGateway(StrEnum):
    STRIPE   = "stripe"
    RAZORPAY = "razorpay"


class PaymentStatus(StrEnum):
    PENDING  = "pending"
    SUCCESS  = "success"
    FAILED   = "failed"
    REFUNDED = "refunded"


class NotificationType(StrEnum):
    INFO    = "info"
    WARNING = "warning"
    ERROR   = "error"
    SUCCESS = "success"


class WorkflowRunStatus(StrEnum):
    RUNNING   = "running"
    COMPLETED = "completed"
    FAILED    = "failed"
    PAUSED    = "paused"


class WorkflowRunStepStatus(StrEnum):
    COMPLETED = "completed"
    FAILED    = "failed"
    SKIPPED   = "skipped"


# ─── Visual Workflow Builder ────────────────────────────────────────────────

class WorkflowTriggerType(StrEnum):
    CAMPAIGN_STARTED      = "campaign_started"
    CAMPAIGN_COMPLETED    = "campaign_completed"
    CALL_STARTED          = "call_started"
    CALL_ANSWERED         = "call_answered"
    CALL_COMPLETED        = "call_completed"
    CALL_FAILED           = "call_failed"
    LEAD_QUALIFIED        = "lead_qualified"
    INTENT_DETECTED       = "intent_detected"
    APPOINTMENT_BOOKED    = "appointment_booked"
    INCOMING_MAKE_WEBHOOK = "incoming_make_webhook"
    CRON                  = "cron"


class WorkflowActionType(StrEnum):
    START_VAPI_CALL        = "start_vapi_call"
    END_CALL               = "end_call"
    TRANSFER_CALL          = "transfer_call"
    UPDATE_CONTACT         = "update_contact"
    CHANGE_LEAD_STATUS     = "change_lead_status"
    ADD_NOTE               = "add_note"
    TRIGGER_MAKE_SCENARIO  = "trigger_make_scenario"
    SEND_WEBHOOK           = "send_webhook"
    SEND_EMAIL_NOTIFICATION = "send_email_notification"
    DELAY                  = "delay"
    RETRY                  = "retry"


class WorkflowLogicType(StrEnum):
    IF_ELSE            = "if_else"
    SWITCH             = "switch"
    WAIT               = "wait"
    MERGE              = "merge"
    PARALLEL_EXECUTION = "parallel_execution"
    STOP_WORKFLOW      = "stop_workflow"


class WorkflowNodeCategory(StrEnum):
    TRIGGER = "trigger"
    ACTION  = "action"
    LOGIC   = "logic"
