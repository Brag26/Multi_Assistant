"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSessionStore } from "@/store/session";
import {
  getWorkflow, createWorkflow, updateWorkflow,
  cloneWorkflow, activateWorkflow, exportWorkflow, importWorkflow,
  saveVersion, type Workflow, type WorkflowNode, type WorkflowEdge,
} from "@/lib/api";
import { DashboardShell } from "@/components/dashboard/shell";
import { WorkflowBuilder } from "@/components/workflow-builder/WorkflowBuilder";
import { WorkflowList } from "@/components/dashboard/WorkflowList";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus } from "lucide-react";

type View = "list" | "builder";

export default function WorkflowsPage() {
  const tenantId = useSessionStore(s => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>("list");
  const [activeId, setActiveId] = useState<string | null>(null);

  // Active workflow
  const { data: workflow, isLoading: wfLoading } = useQuery<Workflow>({
    queryKey: ["workflow", tenantId, activeId],
    queryFn: () => getWorkflow(tenantId, activeId!),
    enabled: Boolean(tenantId) && Boolean(activeId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["workflows", tenantId] });
    if (activeId) queryClient.invalidateQueries({ queryKey: ["workflow", tenantId, activeId] });
  };

  const saveMut = useMutation({
    mutationFn: ({ nodes, edges }: { nodes: WorkflowNode[]; edges: WorkflowEdge[] }) =>
      updateWorkflow(tenantId, activeId!, { nodes, edges }),
    onSuccess: () => {
      // Also save a version snapshot
      if (workflow) {
        saveVersion(tenantId, activeId!, { nodes: workflow.nodes, edges: workflow.edges, config: workflow.config })
          .catch(() => {/* non-critical */});
      }
      invalidate();
    },
  });

  const activateMut = useMutation({
    mutationFn: (active: boolean) => activateWorkflow(tenantId, activeId!, active),
    onSuccess: invalidate,
  });

  const cloneMut = useMutation({
    mutationFn: () => cloneWorkflow(tenantId, activeId!),
    onSuccess: (cloned) => { invalidate(); setActiveId(cloned.id); },
  });

  const exportMut = async () => {
    const payload = await exportWorkflow(tenantId, activeId!);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `${workflow?.name ?? "workflow"}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const importMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) => importWorkflow(tenantId, payload),
    onSuccess: (imported) => { invalidate(); setActiveId(imported.id); },
  });

  const createMut = useMutation({
    mutationFn: () => createWorkflow(tenantId, { name: "New Workflow", description: "", nodes: [], edges: [], config: {} }),
    onSuccess: (wf) => { invalidate(); setActiveId(wf.id); setView("builder"); },
  });

  const openBuilder = (id: string) => { setActiveId(id); setView("builder"); };

  return (
    <DashboardShell>
      {view === "list" ? (
        <>
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-700">Automation</p>
              <h2 className="text-2xl font-semibold tracking-tight">Voice Workflows</h2>
            </div>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending} className="gap-1.5">
              <Plus className="w-4 h-4" /> New Workflow
            </Button>
          </div>
          <WorkflowList tenantId={tenantId} onOpen={openBuilder} />
        </>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setView("list")} className="gap-1 text-sm">
              <ArrowLeft className="w-4 h-4" /> Workflows
            </Button>
          </div>

          {wfLoading || !workflow ? (
            <div className="h-[600px] rounded-xl bg-[#0f1117] flex items-center justify-center text-slate-400 text-sm animate-pulse">
              Loading workflow…
            </div>
          ) : (
            <WorkflowBuilder
              workflow={workflow}
              saving={saveMut.isPending}
              onSave={(nodes, edges) => saveMut.mutate({ nodes, edges })}
              onActivate={(active) => activateMut.mutate(active)}
              onClone={() => cloneMut.mutate()}
              onExport={exportMut}
              onImport={(payload) => importMut.mutate(payload)}
            />
          )}

          {/* Versions + Runs panels below builder */}
          {activeId && workflow && (
            <div className="grid lg:grid-cols-2 gap-4 mt-4">
              <WorkflowVersionPanel tenantId={tenantId} workflowId={activeId} />
              <WorkflowRunsPanel tenantId={tenantId} workflowId={activeId} />
            </div>
          )}
        </>
      )}
    </DashboardShell>
  );
}

// ─── Version panel ────────────────────────────────────────────────────────[...]

import { listVersions as fetchVersions, restoreVersion, type WorkflowVersion } from "@/lib/api";
import { RotateCcw, Clock } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

function WorkflowVersionPanel({ tenantId, workflowId }: { tenantId: string; workflowId: string }) {
  const queryClient = useQueryClient();
  const { data: versions = [] } = useQuery<WorkflowVersion[]>({
    queryKey: ["versions", tenantId, workflowId],
    queryFn: () => fetchVersions(tenantId, workflowId),
    enabled: Boolean(tenantId),
  });

  const restoreMut = useMutation({
    mutationFn: (versionId: string) => restoreVersion(tenantId, workflowId, versionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflow", tenantId, workflowId] });
    },
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <h3 className="font-semibold text-sm flex items-center gap-1.5">
          <Clock className="w-4 h-4 text-slate-400" /> Version History
        </h3>
      </CardHeader>
      <CardContent className="p-0">
        {versions.length === 0 ? (
          <p className="text-sm text-slate-400 px-4 py-4">No saved versions yet. Save the workflow to create one.</p>
        ) : (
          <ul className="divide-y text-sm">
            {versions.slice(0, 8).map(v => (
              <li key={v.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50">
                <div>
                  <span className="font-medium">v{v.version}</span>
                  <span className="text-slate-400 text-xs ml-2">{new Date(v.created_at).toLocaleString()}</span>
                </div>
                <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 px-2"
                  onClick={() => restoreMut.mutate(v.id)}
                  disabled={restoreMut.isPending}>
                  <RotateCcw className="w-3 h-3" /> Restore
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Runs panel ─────────────────────────────────────────────────────────[...]

import { listRuns, type WorkflowRun } from "@/lib/api";
import { Activity } from "lucide-react";

function WorkflowRunsPanel({ tenantId, workflowId }: { tenantId: string; workflowId: string }) {
  const { data: runs = [] } = useQuery<WorkflowRun[]>({
    queryKey: ["runs", tenantId, workflowId],
    queryFn: () => listRuns(tenantId, workflowId),
    enabled: Boolean(tenantId),
    refetchInterval: 10_000,
  });

  const statusColor: Record<string, string> = {
    completed: "bg-emerald-50 text-emerald-700",
    failed:    "bg-red-50 text-red-700",
    running:   "bg-blue-50 text-blue-700",
    paused:    "bg-amber-50 text-amber-700",
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <h3 className="font-semibold text-sm flex items-center gap-1.5">
          <Activity className="w-4 h-4 text-slate-400" /> Recent Runs
        </h3>
      </CardHeader>
      <CardContent className="p-0">
        {runs.length === 0 ? (
          <p className="text-sm text-slate-400 px-4 py-4">No runs yet. Activate the workflow to start receiving events.</p>
        ) : (
          <ul className="divide-y text-sm">
            {runs.slice(0, 8).map(r => (
              <li key={r.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <span className="font-mono text-xs text-slate-500">{r.trigger_event}</span>
                  <span className="text-slate-400 text-xs ml-2">{new Date(r.created_at).toLocaleString()}</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[r.status] ?? "bg-slate-100 text-slate-600"}`}>
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
