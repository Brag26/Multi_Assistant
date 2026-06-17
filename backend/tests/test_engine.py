"""
tests/test_engine.py — unit tests for WorkflowExecutionEngine.

Tests every action and logic node type using mocked async sessions
and external clients.

Run with: pytest backend/tests/test_engine.py -v
"""
import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4


def make_session():
    """Minimal async SQLAlchemy session mock."""
    session = AsyncMock()
    session.add = MagicMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    return session


def make_engine(session=None):
    from app.application.engine import WorkflowExecutionEngine
    s = session or make_session()
    engine = WorkflowExecutionEngine(s)
    # Stub out external clients
    engine.vapi = AsyncMock()
    engine.make = AsyncMock()
    engine.notifications = AsyncMock()
    engine.contacts = AsyncMock()
    engine.appointments = AsyncMock()
    engine.runs = AsyncMock()
    return engine, s


def make_workflow(nodes=None, edges=None, config=None):
    wf = MagicMock()
    wf.id = str(uuid4())
    wf.tenant_id = "tenant-1"
    wf.status = "active"
    wf.nodes = nodes or []
    wf.edges = edges or []
    wf.config = config or {}
    return wf


# ─── Trigger detection ────────────────────────────────────────────────────────

class TestTriggerDetection:
    def test_find_trigger_node_new_format(self):
        engine, _ = make_engine()
        wf = make_workflow(nodes=[
            {"id": "n1", "type": "trigger", "data": {"category": "trigger", "trigger_type": "call_completed", "label": "Call Done"}},
        ])
        node = engine._find_trigger_node(wf, "call_completed")
        assert node is not None
        assert node["id"] == "n1"

    def test_find_trigger_node_no_match(self):
        engine, _ = make_engine()
        wf = make_workflow(nodes=[
            {"id": "n1", "type": "trigger", "data": {"category": "trigger", "trigger_type": "call_started"}},
        ])
        node = engine._find_trigger_node(wf, "lead_qualified")
        assert node is None

    def test_find_trigger_node_legacy_format(self):
        engine, _ = make_engine()
        wf = make_workflow(config={"nodes": [
            {"id": "n1", "type": "trigger", "data": {"event": "campaign_started"}},
        ]})
        node = engine._find_trigger_node(wf, "campaign_started")
        assert node is not None

    def test_build_adjacency_new_edges(self):
        engine, _ = make_engine()
        wf = make_workflow(edges=[
            {"id": "e1", "source": "n1", "target": "n2", "source_handle": "output", "target_handle": "input"},
        ])
        adj = engine._build_adjacency(wf)
        assert "n1" in adj
        assert adj["n1"][0][0] == "n2"

    def test_build_adjacency_virtual_handles(self):
        """Edges from if/else use __true/__false virtual source ids."""
        engine, _ = make_engine()
        wf = make_workflow(edges=[
            {"id": "e1", "source": "n1__true", "target": "n2"},
            {"id": "e2", "source": "n1__false", "target": "n3"},
        ])
        adj = engine._build_adjacency(wf)
        assert "n1" in adj
        targets = [t for t, _, _ in adj["n1"]]
        assert "n2" in targets
        assert "n3" in targets


# ─── Action nodes ─────────────────────────────────────────────────────────────

class TestActionNodes:
    @pytest.mark.asyncio
    async def test_start_vapi_call_success(self):
        engine, session = make_engine()
        engine.vapi.start_call = AsyncMock(return_value="prov-123")

        result = await engine._execute_action("t1", {
            "action_type": "start_vapi_call",
            "config": {"phone": "+15550001111", "vapi_assistant_id": "asst-1"},
        }, {})

        assert result["provider_call_id"] == "prov-123"
        session.add.assert_called_once()
        session.commit.assert_awaited()

    @pytest.mark.asyncio
    async def test_start_vapi_call_missing_phone_raises(self):
        engine, _ = make_engine()
        with pytest.raises(ValueError, match="phone"):
            await engine._execute_action("t1", {
                "action_type": "start_vapi_call",
                "config": {"vapi_assistant_id": "asst-1"},
            }, {})

    @pytest.mark.asyncio
    async def test_end_call_no_call_id_returns_skipped(self):
        engine, _ = make_engine()
        result = await engine._execute_action("t1", {"action_type": "end_call"}, {})
        assert result["status"] == "skipped"

    @pytest.mark.asyncio
    async def test_transfer_call(self):
        engine, _ = make_engine()
        result = await engine._execute_action("t1", {
            "action_type": "transfer_call",
            "destination": "+15550009999",
        }, {})
        assert result["status"] == "transferred"
        assert result["destination"] == "+15550009999"

    @pytest.mark.asyncio
    async def test_change_lead_status(self):
        engine, _ = make_engine()
        contact = MagicMock()
        contact.id = str(uuid4())
        engine.contacts.get = AsyncMock(return_value=contact)

        cid = str(uuid4())
        result = await engine._execute_action("t1", {
            "action_type": "change_lead_status",
            "lead_status": "qualified",
        }, {"contact_id": cid})

        assert result["lead_status"] == "qualified"
        assert contact.lead_status.value == "qualified"

    @pytest.mark.asyncio
    async def test_change_lead_status_missing_contact_raises(self):
        engine, _ = make_engine()
        engine.contacts.get = AsyncMock(return_value=None)
        with pytest.raises(ValueError, match="not found"):
            await engine._execute_action("t1", {
                "action_type": "change_lead_status",
                "lead_status": "converted",
            }, {"contact_id": str(uuid4())})

    @pytest.mark.asyncio
    async def test_trigger_make_scenario(self):
        engine, _ = make_engine()
        engine.make.trigger_workflow = AsyncMock()

        result = await engine._execute_action("t1", {
            "action_type": "trigger_make_scenario",
            "webhook_url": "https://hook.make.com/abc",
        }, {"call_id": "c1"})

        engine.make.trigger_workflow.assert_awaited_once()
        assert result["triggered"] is True

    @pytest.mark.asyncio
    async def test_trigger_make_missing_url_raises(self):
        engine, _ = make_engine()
        with pytest.raises(ValueError, match="webhook_url"):
            await engine._execute_action("t1", {"action_type": "trigger_make_scenario"}, {})

    @pytest.mark.asyncio
    async def test_send_webhook(self):
        engine, _ = make_engine()
        import httpx
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = '{"ok":true}'

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.post = AsyncMock(return_value=mock_resp)
            mock_client_cls.return_value = mock_client

            result = await engine._execute_action("t1", {
                "action_type": "send_webhook",
                "url": "https://example.com/hook",
            }, {})

        assert result["status_code"] == 200

    @pytest.mark.asyncio
    async def test_send_email_notification(self):
        engine, _ = make_engine()
        engine.notifications.create = AsyncMock()

        result = await engine._execute_action("t1", {
            "action_type": "send_email_notification",
            "email": "user@example.com",
            "subject": "Hello",
            "body": "World",
        }, {})

        engine.notifications.create.assert_awaited_once()
        assert result["sent"] is True

    @pytest.mark.asyncio
    async def test_delay(self):
        engine, _ = make_engine()
        with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            result = await engine._execute_action("t1", {
                "action_type": "delay",
                "delay_seconds": 30,
            }, {})
        mock_sleep.assert_awaited_once_with(30)
        assert result["delayed_seconds"] == 30

    @pytest.mark.asyncio
    async def test_retry(self):
        engine, _ = make_engine()
        result = await engine._execute_action("t1", {"action_type": "retry"}, {})
        assert result["retry"] == "success"

    @pytest.mark.asyncio
    async def test_unknown_action_raises(self):
        engine, _ = make_engine()
        with pytest.raises(NotImplementedError, match="not implemented"):
            await engine._execute_action("t1", {"action_type": "magic_action"}, {})


# ─── Logic nodes ──────────────────────────────────────────────────────────────

class TestLogicNodes:
    @pytest.mark.asyncio
    async def test_if_else_true_branch(self):
        engine, _ = make_engine()
        output, port = await engine._execute_logic("t1", {
            "logic_type": "if_else",
            "field": "outcome",
            "operator": "equals",
            "value": "qualified",
        }, {"outcome": "qualified"})
        assert port == "true"
        assert output["match"] is True

    @pytest.mark.asyncio
    async def test_if_else_false_branch(self):
        engine, _ = make_engine()
        output, port = await engine._execute_logic("t1", {
            "logic_type": "if_else",
            "field": "outcome",
            "operator": "equals",
            "value": "qualified",
        }, {"outcome": "not_interested"})
        assert port == "false"
        assert output["match"] is False

    @pytest.mark.asyncio
    async def test_if_else_not_equals(self):
        engine, _ = make_engine()
        _, port = await engine._execute_logic("t1", {
            "logic_type": "if_else",
            "field": "status",
            "operator": "not_equals",
            "value": "failed",
        }, {"status": "completed"})
        assert port == "true"

    @pytest.mark.asyncio
    async def test_if_else_exists_operator(self):
        engine, _ = make_engine()
        _, port = await engine._execute_logic("t1", {
            "logic_type": "if_else",
            "field": "contact_id",
            "operator": "exists",
        }, {"contact_id": "some-uuid"})
        assert port == "true"

    @pytest.mark.asyncio
    async def test_switch_matching_case(self):
        engine, _ = make_engine()
        output, port = await engine._execute_logic("t1", {
            "logic_type": "switch",
            "field": "outcome",
            "cases": [
                {"value": "qualified", "port": "qualified_port"},
                {"value": "failed",    "port": "failed_port"},
            ],
        }, {"outcome": "qualified"})
        assert port == "qualified_port"

    @pytest.mark.asyncio
    async def test_switch_default_fallthrough(self):
        engine, _ = make_engine()
        _, port = await engine._execute_logic("t1", {
            "logic_type": "switch",
            "field": "outcome",
            "cases": [{"value": "qualified", "port": "q"}],
        }, {"outcome": "unknown_value"})
        assert port == "default"

    @pytest.mark.asyncio
    async def test_wait_node(self):
        engine, _ = make_engine()
        with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            output, port = await engine._execute_logic("t1", {
                "logic_type": "wait",
                "wait_seconds": 5,
            }, {})
        mock_sleep.assert_awaited_once_with(5)
        assert port == "output"

    @pytest.mark.asyncio
    async def test_merge_node(self):
        engine, _ = make_engine()
        output, port = await engine._execute_logic("t1", {"logic_type": "merge"}, {})
        assert output["merged"] is True
        assert port == "output"

    @pytest.mark.asyncio
    async def test_parallel_execution_node(self):
        engine, _ = make_engine()
        output, port = await engine._execute_logic("t1", {"logic_type": "parallel_execution"}, {})
        assert output["parallel"] is True

    @pytest.mark.asyncio
    async def test_unknown_logic_raises(self):
        engine, _ = make_engine()
        with pytest.raises(NotImplementedError):
            await engine._execute_logic("t1", {"logic_type": "quantum_entanglement"}, {})


# ─── Full workflow run integration tests ─────────────────────────────────────

class TestFullWorkflowRun:
    @pytest.mark.asyncio
    async def test_simple_trigger_to_action(self):
        """Trigger → Action → end."""
        engine, _ = make_engine()
        engine.runs.create_run = AsyncMock(return_value=MagicMock(id="run-1"))
        engine.runs.add_step = AsyncMock()
        engine.runs.update_run_status = AsyncMock()
        engine.vapi.start_call = AsyncMock(return_value="prov-1")

        wf = make_workflow(
            nodes=[
                {"id": "t1", "type": "trigger", "data": {"category": "trigger", "trigger_type": "call_started", "label": "Start"}},
                {"id": "a1", "type": "action", "data": {"category": "action", "action_type": "delay", "label": "Wait", "delay_seconds": 0}},
            ],
            edges=[
                {"id": "e1", "source": "t1", "target": "a1"},
            ],
        )

        trigger = wf.nodes[0]
        with patch("asyncio.sleep", new_callable=AsyncMock):
            await engine.run_workflow("t1", wf, trigger, {"phone": "+15550001111"})

        engine.runs.update_run_status.assert_awaited()
        args = engine.runs.update_run_status.call_args[0]
        # Last call should be COMPLETED
        from app.domain.enums import WorkflowRunStatus
        assert args[1] == WorkflowRunStatus.COMPLETED

    @pytest.mark.asyncio
    async def test_workflow_stops_on_stop_node(self):
        engine, _ = make_engine()
        engine.runs.create_run = AsyncMock(return_value=MagicMock(id="run-2"))
        engine.runs.add_step = AsyncMock()
        engine.runs.update_run_status = AsyncMock()

        wf = make_workflow(
            nodes=[
                {"id": "t1", "type": "trigger", "data": {"category": "trigger", "trigger_type": "call_completed", "label": "Trigger"}},
                {"id": "s1", "type": "stop", "data": {"category": "stop", "logic_type": "stop_workflow", "label": "Stop"}},
            ],
            edges=[{"id": "e1", "source": "t1", "target": "s1"}],
        )

        await engine.run_workflow("t1", wf, wf.nodes[0], {})

        from app.domain.enums import WorkflowRunStatus
        call_args = engine.runs.update_run_status.call_args[0]
        assert call_args[1] == WorkflowRunStatus.COMPLETED

    @pytest.mark.asyncio
    async def test_workflow_fails_on_bad_action(self):
        engine, _ = make_engine()
        engine.runs.create_run = AsyncMock(return_value=MagicMock(id="run-3"))
        engine.runs.add_step = AsyncMock()
        engine.runs.update_run_status = AsyncMock()

        # start_vapi_call with no phone → ValueError → FAILED
        wf = make_workflow(
            nodes=[
                {"id": "t1", "type": "trigger", "data": {"category": "trigger", "trigger_type": "call_started", "label": "T"}},
                {"id": "a1", "type": "action", "data": {"category": "action", "action_type": "start_vapi_call", "label": "Call"}},
            ],
            edges=[{"id": "e1", "source": "t1", "target": "a1"}],
        )

        await engine.run_workflow("t1", wf, wf.nodes[0], {})

        from app.domain.enums import WorkflowRunStatus
        call_args = engine.runs.update_run_status.call_args[0]
        assert call_args[1] == WorkflowRunStatus.FAILED
