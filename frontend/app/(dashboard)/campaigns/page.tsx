"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSessionStore } from "@/store/session";
import { listCampaigns, campaignAction, deleteCampaign, getMySettings, type Campaign } from "@/lib/api";
import { detectBrowserTimezone, formatInTimezone } from "@/lib/timezones";
import { DashboardShell } from "@/components/dashboard/shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Megaphone, Pause, Play, Copy, X, Clock, BarChart2, Plus, Rocket, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { NewCampaignModal } from "@/components/dashboard/NewCampaignModal";

const STATUS_STYLE: Record<string, string> = {
  draft:     "bg-slate-100 text-slate-600",
  scheduled: "bg-blue-50 text-blue-700",
  running:   "bg-emerald-50 text-emerald-700 animate-pulse",
  paused:    "bg-amber-50 text-amber-700",
  completed: "bg-violet-50 text-violet-700",
  canceled:  "bg-red-50 text-red-700",
};

export default function CampaignsPage() {
  const tenantId = useSessionStore(s => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [newCampaignOpen, setNewCampaignOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [displayTz, setDisplayTz] = useState(detectBrowserTimezone());

  useEffect(() => {
    if (!tenantId) return;
    getMySettings(tenantId).then((res) => { if (res.timezone) setDisplayTz(res.timezone); }).catch(() => {});
  }, [tenantId]);

  const { data: campaigns = [], isLoading } = useQuery<Campaign[]>({
    queryKey: ["campaigns", tenantId],
    queryFn: () => listCampaigns(tenantId),
    enabled: Boolean(tenantId),
    refetchInterval: 15_000,
  });

  const actionMut = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "pause" | "resume" | "cancel" | "clone" | "launch" }) =>
      campaignAction(tenantId, id, action),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaigns", tenantId] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteCampaign(tenantId, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaigns", tenantId] }),
  });

  const filtered = statusFilter ? campaigns.filter(c => c.status === statusFilter) : campaigns;

  return (
    <DashboardShell>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-blue-700">Outreach</p>
          <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Megaphone className="w-6 h-6" /> Campaigns
          </h2>
        </div>
        <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setNewCampaignOpen(true)}>
          <Plus className="w-3.5 h-3.5" /> New Campaign
        </Button>
      </div>
      <NewCampaignModal tenantId={tenantId} open={newCampaignOpen || Boolean(editingCampaign)}
        onClose={() => { setNewCampaignOpen(false); setEditingCampaign(null); }}
        editingCampaign={editingCampaign}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ["campaigns", tenantId] })} />

      <div className="flex gap-1.5 mb-4 flex-wrap">
        {[undefined, "draft", "scheduled", "running", "paused", "completed"].map(s => (
          <Button key={String(s)} size="sm" variant={statusFilter === s ? "default" : "ghost"}
            className="h-7 px-3 text-xs capitalize" onClick={() => setStatusFilter(s)}>
            {s ?? "All"}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-slate-100 rounded-lg animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-slate-400">
            <Megaphone className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No campaigns {statusFilter ? `with status "${statusFilter}"` : "yet"}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(c => (
            <Card key={c.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm">{c.name}</h3>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_STYLE[c.status] ?? ""}`}>
                        {c.status}
                      </span>
                    </div>
                    {c.description && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-1">{c.description}</p>
                    )}
                    {c.scheduled_at && (
                      <div className="flex items-center gap-1 mt-1.5 text-xs text-slate-400">
                        <Clock className="w-3 h-3" />
                        Scheduled for {formatInTimezone(c.scheduled_at, displayTz)} ({displayTz})
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Link href={`/reports?campaign=${c.id}`}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md text-slate-500 hover:bg-slate-100 transition-colors">
                      <BarChart2 className="w-3.5 h-3.5" /> Report
                    </Link>
                    {(c.status === "draft" || c.status === "scheduled") && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-indigo-600"
                        title="Edit"
                        onClick={() => setEditingCampaign(c)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {(c.status === "draft" || c.status === "scheduled") && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-indigo-600"
                        title="Launch now"
                        onClick={() => actionMut.mutate({ id: c.id, action: "launch" })}>
                        <Rocket className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {c.status === "running" && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-amber-600"
                        onClick={() => actionMut.mutate({ id: c.id, action: "pause" })}>
                        <Pause className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {c.status === "paused" && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-emerald-600"
                        onClick={() => actionMut.mutate({ id: c.id, action: "resume" })}>
                        <Play className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-slate-500"
                      title="Clone"
                      onClick={() => actionMut.mutate({ id: c.id, action: "clone" })}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    {(c.status === "scheduled" || c.status === "running") && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-red-400 hover:text-red-600"
                        title="Cancel"
                        onClick={() => actionMut.mutate({ id: c.id, action: "cancel" })}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {c.status !== "running" && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-red-500 hover:text-red-700"
                        title="Delete"
                        onClick={() => {
                          if (window.confirm(`Delete campaign "${c.name}"? This can't be undone.`)) {
                            deleteMut.mutate(c.id);
                          }
                        }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
