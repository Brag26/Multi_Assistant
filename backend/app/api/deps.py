"""api/deps.py — dependency injection wiring."""
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.analytics import AnalyticsService
from app.application.engine import WorkflowExecutionEngine
from app.application.module_services import CampaignService, ContactService, IntegrationService
from app.application.services import CallService, WorkflowService
from app.infrastructure.db.session import get_session
from app.infrastructure.integrations.make import MakeClient
from app.infrastructure.integrations.vapi import VapiClient
from app.infrastructure.repositories.appointments import SqlAlchemyAppointmentRepository
from app.infrastructure.repositories.calls import SqlAlchemyCallRepository
from app.infrastructure.repositories.campaigns import SqlAlchemyCampaignRepository
from app.infrastructure.repositories.contacts import SqlAlchemyContactRepository
from app.infrastructure.repositories.integrations import SqlAlchemyIntegrationRepository
from app.infrastructure.repositories.notifications import SqlAlchemyNotificationRepository
from app.infrastructure.repositories.runs import SqlAlchemyWorkflowRunRepository
from app.infrastructure.repositories.workflows import SqlAlchemyWorkflowRepository

SessionDep = Annotated[AsyncSession, Depends(get_session)]

# shortcut so monitoring.py can import it too
get_db_session = get_session


def workflow_service(session: SessionDep) -> WorkflowService:
    return WorkflowService(
        SqlAlchemyWorkflowRepository(session),
        SqlAlchemyWorkflowRunRepository(session),
    )


def call_service(session: SessionDep) -> CallService:
    return CallService(
        SqlAlchemyWorkflowRepository(session),
        SqlAlchemyCallRepository(session),
        VapiClient(),
        MakeClient(),
    )


def contact_service(session: SessionDep) -> ContactService:
    return ContactService(SqlAlchemyContactRepository(session))


def campaign_service(session: SessionDep) -> CampaignService:
    return CampaignService(SqlAlchemyCampaignRepository(session))


def integration_service(session: SessionDep) -> IntegrationService:
    return IntegrationService(SqlAlchemyIntegrationRepository(session))


def appointment_repository(session: SessionDep) -> SqlAlchemyAppointmentRepository:
    return SqlAlchemyAppointmentRepository(session)


def notification_repository(session: SessionDep) -> SqlAlchemyNotificationRepository:
    return SqlAlchemyNotificationRepository(session)


def workflow_run_repository(session: SessionDep) -> SqlAlchemyWorkflowRunRepository:
    return SqlAlchemyWorkflowRunRepository(session)


def analytics_service(session: SessionDep) -> AnalyticsService:
    return AnalyticsService(session)


def workflow_engine(session: SessionDep) -> WorkflowExecutionEngine:
    return WorkflowExecutionEngine(session)
