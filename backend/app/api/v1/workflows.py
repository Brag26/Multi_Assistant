"""
api/v1/workflows.py — Visual Workflow Builder endpoints.

Routes:
  GET    /tenants/{tenant_id}/workflows                  list
  POST   /tenants/{tenant_id}/workflows                  create
  GET    /tenants/{tenant_id}/workflows/{id}             get
  PUT    /tenants/{tenant_id}/workflows/{id}             update (save builder graph)
  DELETE /tenants/{tenant_id}/workflows/{id}             archive
  POST   /tenants/{tenant_id}/workflows/{id}/clone       clone
  POST   /tenants/{tenant_id}/workflows/{id}/activate    activate / deactivate
  GET    /tenants/{tenant_id}/workflows/{id}/versions    list versions
  POST   /tenants/{tenant_id}/workflows/{id}/versions    save current graph as new version
  POST   /tenants/{tenant_id}/workflows/{id}/versions/{vid}/restore  restore
  GET    /tenants/{tenant_id}/workflows/{id}/export      export JSON
  POST   /tenants/{tenant_id}/workflows/import           import JSON
  GET    /tenants/{tenant_id}/workflows/{id}/runs        list runs
  GET    /tenants/{tenant_id}/workflows/{id}/runs/{rid}  run detail + steps
  POST   /tenants/{tenant_id}/workflows/{id}/calls       launch call
"""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, status

from app.api.deps import call_service, workflow_service
from app.application.schemas import (
    CallRead,
    LaunchCallRequest,
    WorkflowActivateRequest,
    WorkflowCreate,
    WorkflowExportPayload,
    WorkflowRead,
    WorkflowRunRead,
    WorkflowRunStepRead,
    WorkflowUpdate,
    WorkflowVersionRead,
)
from app.application.services import CallService, WorkflowService
from app.core.security import CurrentUser

router = APIRouter(prefix="/tenants/{tenant_id}/workflows", tags=["workflows"])


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[WorkflowRead])
async def list_workflows(
    tenant_id: str,
    user: CurrentUser,
    service: Annotated[WorkflowService, Depends(workflow_service)],
):
    return await service.list_workflows(user, tenant_id)


@router.post("", response_model=WorkflowRead, status_code=status.HTTP_201_CREATED)
async def create_workflow(
    tenant_id: str,
    payload: WorkflowCreate,
    user: CurrentUser,
    service: Annotated[WorkflowService, Depends(workflow_service)],
):
    return await service.create_workflow(user, tenant_id, payload)


@router.get("/{workflow_id}", response_model=WorkflowRead)
async def get_workflow(
    tenant_id: str,
    workflow_id: UUID,
    user: CurrentUser,
    service: Annotated[WorkflowService, Depends(workflow_service)],
):
    wf = await service.get_workflow(user, tenant_id, workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return wf


@router.put("/{workflow_id}", response_model=WorkflowRead)
async def update_workflow(
    tenant_id: str,
    workflow_id: UUID,
    payload: WorkflowUpdate,
    user: CurrentUser,
    service: Annotated[WorkflowService, Depends(workflow_service)],
):
    """Save the full builder graph (nodes + edges + metadata)."""
    return await service.update_workflow(
        user, tenant_id, workflow_id, payload.model_dump(exclude_none=True)
    )


@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_workflow(
    tenant_id: str,
    workflow_id: UUID,
    user: CurrentUser,
    service: Annotated[WorkflowService, Depends(workflow_service)],
):
    await service.update_workflow(
        user, tenant_id, workflow_id, {"status": "archived"}
    )


# ── Activate / Deactivate ────────────────────────────────────────────────────

@router.post("/{workflow_id}/activate", response_model=WorkflowRead)
async def set_active(
    tenant_id: str,
    workflow_id: UUID,
    payload: WorkflowActivateRequest,
    user: CurrentUser,
    service: Annotated[WorkflowService, Depends(workflow_service)],
):
    return await service.set_active(user, tenant_id, workflow_id, payload.active)


# ── Clone ────────────────────────────────────────────────────────────────────

@router.post("/{workflow_id}/clone", response_model=WorkflowRead)
async def clone_workflow(
    tenant_id: str,
    workflow_id: UUID,
    user: CurrentUser,
    service: Annotated[WorkflowService, Depends(workflow_service)],
):
    return await service.clone_workflow(user, tenant_id, workflow_id)


# ── Versions ─────────────────────────────────────────────────────────────────

@router.get("/{workflow_id}/versions", response_model=list[WorkflowVersionRead])
async def list_versions(
    tenant_id: str,
    workflow_id: UUID,
    user: CurrentUser,
    service: Annotated[WorkflowService, Depends(workflow_service)],
):
    return await service.list_versions(user, tenant_id, workflow_id)


@router.post("/{workflow_id}/versions", response_model=WorkflowVersionRead, status_code=201)
async def create_version(
    tenant_id: str,
    workflow_id: UUID,
    user: CurrentUser,
    service: Annotated[WorkflowService, Depends(workflow_service)],
    payload: dict = Body(default={}),
):
    return await service.create_version(user, tenant_id, workflow_id, payload.get("config", {}))


@router.post("/{workflow_id}/versions/{version_id}/restore", response_model=WorkflowRead)
async def restore_version(
    tenant_id: str,
    workflow_id: UUID,
    version_id: UUID,
    user: CurrentUser,
    service: Annotated[WorkflowService, Depends(workflow_service)],
):
    result = await service.restore_version(user, tenant_id, workflow_id, version_id)
    if not result:
        raise HTTPException(status_code=404, detail="Version not found")
    return result


# ── Import / Export ──────────────────────────────────────────────────────────

@router.get("/{workflow_id}/export", response_model=WorkflowExportPayload)
async def export_workflow(
    tenant_id: str,
    workflow_id: UUID,
    user: CurrentUser,
    service: Annotated[WorkflowService, Depends(workflow_service)],
):
    return await service.export_workflow(user, tenant_id, workflow_id)


@router.post("/import", response_model=WorkflowRead, status_code=201)
async def import_workflow(
    tenant_id: str,
    payload: WorkflowExportPayload,
    user: CurrentUser,
    service: Annotated[WorkflowService, Depends(workflow_service)],
):
    return await service.import_workflow(user, tenant_id, payload.model_dump())


# ── Runs ─────────────────────────────────────────────────────────────────────

@router.get("/{workflow_id}/runs", response_model=list[WorkflowRunRead])
async def list_runs(
    tenant_id: str,
    workflow_id: UUID,
    user: CurrentUser,
    service: Annotated[WorkflowService, Depends(workflow_service)],
):
    return await service.list_runs(user, tenant_id, workflow_id)


@router.get("/{workflow_id}/runs/{run_id}", response_model=WorkflowRunRead)
async def get_run(
    tenant_id: str,
    workflow_id: UUID,
    run_id: UUID,
    user: CurrentUser,
    service: Annotated[WorkflowService, Depends(workflow_service)],
):
    return await service.get_run(user, tenant_id, run_id)


@router.get("/{workflow_id}/runs/{run_id}/steps", response_model=list[WorkflowRunStepRead])
async def list_run_steps(
    tenant_id: str,
    workflow_id: UUID,
    run_id: UUID,
    user: CurrentUser,
    service: Annotated[WorkflowService, Depends(workflow_service)],
):
    return await service.list_run_steps(user, tenant_id, run_id)


# ── Launch Call ───────────────────────────────────────────────────────────────

@router.post("/{workflow_id}/calls", response_model=CallRead, status_code=202)
async def launch_call(
    tenant_id: str,
    workflow_id: UUID,
    payload: LaunchCallRequest,
    user: CurrentUser,
    service: Annotated[CallService, Depends(call_service)],
):
    return await service.launch_call(user, tenant_id, workflow_id, payload)
