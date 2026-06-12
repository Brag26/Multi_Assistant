"""
tests/test_workflows.py — unit + integration tests for workflow builder.

Run with:  pytest backend/tests/test_workflows.py -v
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.application.schemas import WorkflowCreate, WorkflowNode, WorkflowEdge, WorkflowNodeData
from app.application.services import WorkflowService
from app.domain.enums import WorkflowStatus, WorkflowTriggerType, WorkflowActionType
from app.core.security import Principal, Role


# ─── Fixtures ────────────────────────────────────────────────────────────────

def make_principal(role: Role = Role.MANAGER) -> Principal:
    return Principal(sub=str(uuid4()), tenant_id="tenant-1", role=role)


def make_workflow_model(tenant_id="tenant-1", status="draft"):
    m = MagicMock()
    m.id = str(uuid4())
    m.tenant_id = tenant_id
    m.name = "Test Workflow"
    m.description = None
    m.status = status
    m.nodes = []
    m.edges = []
    m.config = {}
    m.trigger_type = None
    m.cron_expression = None
    m.builder_version = 1
    m.vapi_assistant_id = None
    m.twilio_phone_number = None
    m.make_webhook_url = None
    return m


def make_version_model(workflow_id, version=1):
    m = MagicMock()
    m.id = str(uuid4())
    m.tenant_id = "tenant-1"
    m.workflow_id = workflow_id
    m.version = version
    m.config = {"nodes": [], "edges": []}
    return m


# ─── WorkflowService unit tests ───────────────────────────────────────────────

class TestWorkflowServiceCreate:
    @pytest.mark.asyncio
    async def test_create_workflow_success(self):
        repo = AsyncMock()
        wf = make_workflow_model()
        repo.create.return_value = wf
        service = WorkflowService(repo)
        user = make_principal(Role.MANAGER)

        data = WorkflowCreate(name="My Workflow", config={})
        result = await service.create_workflow(user, "tenant-1", data)

        repo.create.assert_awaited_once_with("tenant-1", data)
        assert result.id == wf.id

    @pytest.mark.asyncio
    async def test_create_workflow_forbidden_for_agent(self):
        from fastapi import HTTPException
        repo = AsyncMock()
        service = WorkflowService(repo)
        user = make_principal(Role.AGENT)

        with pytest.raises(HTTPException) as exc_info:
            await service.create_workflow(user, "tenant-1", WorkflowCreate(name="x", config={}))
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_create_workflow_forbidden_for_viewer(self):
        from fastapi import HTTPException
        repo = AsyncMock()
        service = WorkflowService(repo)
        user = make_principal(Role.VIEWER)

        with pytest.raises(HTTPException) as exc_info:
            await service.create_workflow(user, "tenant-1", WorkflowCreate(name="x", config={}))
        assert exc_info.value.status_code == 403


class TestWorkflowServiceActivate:
    @pytest.mark.asyncio
    async def test_activate_sets_active_status(self):
        repo = AsyncMock()
        wf = make_workflow_model(status="active")
        repo.set_active.return_value = wf
        service = WorkflowService(repo)
        user = make_principal(Role.MANAGER)

        result = await service.set_active(user, "tenant-1", wf.id, True)

        repo.set_active.assert_awaited_once_with("tenant-1", wf.id, True)
        assert result.status == "active"

    @pytest.mark.asyncio
    async def test_activate_not_found_raises_404(self):
        from fastapi import HTTPException
        repo = AsyncMock()
        repo.set_active.return_value = None
        service = WorkflowService(repo)
        user = make_principal(Role.MANAGER)

        with pytest.raises(HTTPException) as exc_info:
            await service.set_active(user, "tenant-1", str(uuid4()), True)
        assert exc_info.value.status_code == 404


class TestWorkflowServiceClone:
    @pytest.mark.asyncio
    async def test_clone_returns_new_workflow(self):
        repo = AsyncMock()
        original = make_workflow_model()
        clone = make_workflow_model()
        clone.name = f"Copy of {original.name}"
        repo.clone.return_value = clone
        service = WorkflowService(repo)
        user = make_principal(Role.MANAGER)

        result = await service.clone_workflow(user, "tenant-1", original.id)

        repo.clone.assert_awaited_once_with("tenant-1", original.id)
        assert "Copy of" in result.name

    @pytest.mark.asyncio
    async def test_clone_not_found_raises_404(self):
        from fastapi import HTTPException
        repo = AsyncMock()
        repo.clone.return_value = None
        service = WorkflowService(repo)
        user = make_principal(Role.MANAGER)

        with pytest.raises(HTTPException) as exc_info:
            await service.clone_workflow(user, "tenant-1", str(uuid4()))
        assert exc_info.value.status_code == 404


class TestWorkflowServiceVersions:
    @pytest.mark.asyncio
    async def test_create_version_requires_write_role(self):
        from fastapi import HTTPException
        repo = AsyncMock()
        service = WorkflowService(repo)
        user = make_principal(Role.VIEWER)

        with pytest.raises(HTTPException) as exc_info:
            await service.create_version(user, "tenant-1", str(uuid4()), {})
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_list_versions_returns_list(self):
        repo = AsyncMock()
        wf_id = str(uuid4())
        versions = [make_version_model(wf_id, v) for v in [3, 2, 1]]
        repo.list_versions.return_value = versions
        service = WorkflowService(repo)
        user = make_principal(Role.MANAGER)

        result = await service.list_versions(user, "tenant-1", wf_id)
        assert len(result) == 3
        assert result[0].version == 3


class TestWorkflowServiceImportExport:
    @pytest.mark.asyncio
    async def test_export_returns_payload(self):
        repo = AsyncMock()
        wf_id = str(uuid4())
        repo.export_workflow.return_value = {
            "schema_version": "1.0",
            "name": "Exported",
            "nodes": [],
            "edges": [],
        }
        service = WorkflowService(repo)
        user = make_principal(Role.MANAGER)

        result = await service.export_workflow(user, "tenant-1", wf_id)
        assert result["schema_version"] == "1.0"

    @pytest.mark.asyncio
    async def test_import_creates_workflow(self):
        repo = AsyncMock()
        wf = make_workflow_model()
        repo.import_workflow.return_value = wf
        service = WorkflowService(repo)
        user = make_principal(Role.MANAGER)

        payload = {"name": "Imported", "nodes": [], "edges": [], "config": {}}
        result = await service.import_workflow(user, "tenant-1", payload)

        repo.import_workflow.assert_awaited_once_with("tenant-1", payload)
        assert result.id == wf.id


# ─── WorkflowNode schema tests ────────────────────────────────────────────────

class TestWorkflowSchemas:
    def test_trigger_node_valid(self):
        node = WorkflowNode(
            id="n1",
            type="trigger",
            position={"x": 100, "y": 200},
            data=WorkflowNodeData(
                label="Call Started",
                category="trigger",
                trigger_type=WorkflowTriggerType.CALL_STARTED,
            ),
        )
        assert node.data.trigger_type == WorkflowTriggerType.CALL_STARTED

    def test_action_node_valid(self):
        node = WorkflowNode(
            id="n2",
            type="action",
            position={"x": 300, "y": 200},
            data=WorkflowNodeData(
                label="Send Email",
                category="action",
                action_type=WorkflowActionType.SEND_EMAIL_NOTIFICATION,
                config={"to": "admin@example.com"},
            ),
        )
        assert node.data.config["to"] == "admin@example.com"

    def test_edge_valid(self):
        edge = WorkflowEdge(
            id="e1", source="n1", target="n2", animated=True
        )
        assert edge.source == "n1"
        assert edge.animated is True

    def test_workflow_create_with_nodes(self):
        nodes = [
            WorkflowNode(
                id="n1", type="trigger", position={"x": 0, "y": 0},
                data=WorkflowNodeData(
                    label="Cron", category="trigger",
                    trigger_type=WorkflowTriggerType.CRON,
                    cron_expression="0 9 * * 1-5",
                )
            )
        ]
        wf = WorkflowCreate(name="Scheduled Workflow", config={}, nodes=nodes, edges=[])
        assert len(wf.nodes) == 1
        assert wf.nodes[0].data.cron_expression == "0 9 * * 1-5"


# ─── Repository-level unit tests (using in-memory mocks) ─────────────────────

class TestWorkflowRepository:
    """
    These tests mock the SQLAlchemy session to unit-test the repository
    without a real database connection.
    """

    @pytest.mark.asyncio
    async def test_set_active_calls_update(self):
        from app.infrastructure.repositories.workflows import SqlAlchemyWorkflowRepository

        session = AsyncMock()
        repo = SqlAlchemyWorkflowRepository(session)

        wf = make_workflow_model()
        repo.get_for_tenant = AsyncMock(return_value=wf)
        repo.update = AsyncMock(return_value=wf)

        await repo.set_active("tenant-1", wf.id, True)
        repo.update.assert_awaited_once()
        call_args = repo.update.call_args[0]
        assert call_args[2]["status"] == WorkflowStatus.ACTIVE

    @pytest.mark.asyncio
    async def test_set_inactive_sets_paused(self):
        from app.infrastructure.repositories.workflows import SqlAlchemyWorkflowRepository

        session = AsyncMock()
        repo = SqlAlchemyWorkflowRepository(session)
        wf = make_workflow_model()
        repo.update = AsyncMock(return_value=wf)

        await repo.set_active("tenant-1", wf.id, False)
        call_args = repo.update.call_args[0]
        assert call_args[2]["status"] == WorkflowStatus.PAUSED
