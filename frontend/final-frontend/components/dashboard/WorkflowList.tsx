"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PhoneCall, Play, Pause, Copy, Settings, Clock, Zap } from "lucide-react";
import { listWorkflows, activateWorkflow, cloneWorkflow, type Workflow } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Props {
  tenantId: string;
  onOpen: (id: string) => void;
}

const STATUS_STYLE: Record<string, string> = {
  active:   "bg-emerald-50 text-emerald-700 border-emerald-200",
  draft:    "bg-slate-100 text-slate-600 border-slate-200",
  paused:   "bg-amber-50 text-amber-700 border-amber-200",
  archived: "bg-red-50 text-red-700 border-red-200",
};

const TRIGGER_ICONS: Record<string, React.ReactNode> = {
  cron:                  <Clock className="w-3.5 h-3.5" />,
  incoming_make_webhook: <Zap className="w-3.5 h-3.5" />,
  call_started:          <PhoneCall className="w-3.5 h-3.5" />,
};

export function WorkflowList({ tenantId, onOpen }: Props) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<Workflow[]>({
    queryKey: ["workflows", tenantId],
    queryFn: () => listWorkflows(tenantId),
    enabled: Boolean(tenantId),
  });

  const activateMut = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      activateWorkflow(tenantId, id, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflows", tenantId] }),
  });

  const cloneMut = useMutation({
    mutationFn: (id: string) => cloneWorkflow(tenantId, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflows", tenantId] }),
  });

  if (!tenantId) return <Empty title="No tenant selected" desc="Set NEXT_PUBLIC_DEMO_TENANT_ID or sign in." />;
  if (isLoading) return <Empty title="Loading…" desc="Fetching workflows." />;
  if (error)     return <Empty title="Error" desc="Check API connectivity." />;
  if (!data?.length) return (
    <Empty title="No workflows yet"
      desc="Click New Workflow to build your first voice automation." />
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {data.map(wf => (
        <Card key={wf.id} className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
            <div className="min-w-0">
              <h3 className="font-semibold truncate">{wf.name}</h3>
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                {wf.description ?? "No description"}
              </p>
            </div>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLE[wf.status] ?? ""}`}>
              {wf.status}
            </span>
          </CardHeader>

          <CardContent className="space-y-3">
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-slate-400">Trigger</dt>
                <dd className="font-medium flex items-center gap-1 mt-0.5">
                  {wf.trigger_type ? (
                    <>
                      {TRIGGER_ICONS[wf.trigger_type]}
                      <span className="truncate">{wf.trigger_type.replace(/_/g, " ")}</span>
                    </>
                  ) : <span className="text-slate-400">Not set</span>}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Nodes</dt>
                <dd className="font-medium mt-0.5">{wf.nodes?.length ?? 0}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Version</dt>
                <dd className="font-medium mt-0.5">v{wf.builder_version}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Updated</dt>
                <dd className="font-medium mt-0.5">{new Date(wf.updated_at).toLocaleDateString()}</dd>
              </div>
            </dl>

            <div className="flex gap-2 pt-1">
              <Button size="sm" className="flex-1 gap-1.5 text-xs h-7"
                onClick={() => onOpen(wf.id)}>
                <Settings className="w-3.5 h-3.5" /> Open Builder
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2"
                title={wf.status === "active" ? "Deactivate" : "Activate"}
                onClick={() => activateMut.mutate({ id: wf.id, active: wf.status !== "active" })}>
                {wf.status === "active"
                  ? <Pause className="w-3.5 h-3.5 text-amber-600" />
                  : <Play className="w-3.5 h-3.5 text-emerald-600" />}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2"
                title="Clone"
                onClick={() => cloneMut.mutate(wf.id)}>
                <Copy className="w-3.5 h-3.5 text-slate-500" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Empty({ title, desc }: { title: string; desc: string }) {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <h3 className="font-semibold text-slate-700">{title}</h3>
        <p className="mt-1 text-sm text-slate-400">{desc}</p>
      </CardContent>
    </Card>
  );
}
