"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSessionStore } from "@/store/session";
import { apiFetch } from "@/lib/api";
import { DashboardShell } from "@/components/dashboard/shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Webhook, Plus, Trash2, Send, X, CheckCircle, XCircle } from "lucide-react";

interface OutboundWebhook {
  id: string;
  name: string;
  target_url: string;
  events: string[];
  enabled: boolean;
  last_triggered_at?: string;
  last_status_code?: string;
}

export default function OutboundWebhooksPage() {
  const tenantId = useSessionStore(s => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);

  const { data: hooks = [], isLoading } = useQuery<OutboundWebhook[]>({
    queryKey: ["outbound-webhooks", tenantId],
    queryFn: () => apiFetch(`/tenants/${tenantId}/outbound-webhooks`),
    enabled: Boolean(tenantId),
  });

  const { data: eventsData } = useQuery<{ events: string[] }>({
    queryKey: ["available-events", tenantId],
    queryFn: () => apiFetch(`/tenants/${tenantId}/outbound-webhooks/available-events`),
    enabled: Boolean(tenantId),
  });

  const createMut = useMutation({
    mutationFn: () => apiFetch(`/tenants/${tenantId}/outbound-webhooks`, {
      method: "POST",
      body: JSON.stringify({ name, target_url: url, events: selectedEvents }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outbound-webhooks", tenantId] });
      setShowForm(false); setName(""); setUrl(""); setSelectedEvents([]);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/tenants/${tenantId}/outbound-webhooks/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["outbound-webhooks", tenantId] }),
  });

  const testMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/tenants/${tenantId}/outbound-webhooks/${id}/test`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["outbound-webhooks", tenantId] }),
  });

  const toggleEvent = (e: string) => {
    setSelectedEvents(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]);
  };

  return (
    <DashboardShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-blue-700">Integrations</p>
          <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Webhook className="w-6 h-6" /> Outbound Webhooks
          </h2>
          <p className="text-sm text-slate-500 mt-1">Connect Zapier, n8n, or any custom URL without writing a workflow.</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="gap-1.5">
          <Plus className="w-4 h-4" /> New Webhook
        </Button>
      </div>

      {showForm && (
        <Card className="mb-4 border-blue-200">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">New outbound webhook</p>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Name (e.g. Zapier - new leads)" value={name} onChange={e => setName(e.target.value)} />
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="https://hooks.zapier.com/..." value={url} onChange={e => setUrl(e.target.value)} />

            <div>
              <p className="text-xs font-medium text-slate-500 mb-2">Trigger on events</p>
              <div className="flex flex-wrap gap-1.5">
                {(eventsData?.events ?? []).map(ev => (
                  <button key={ev}
                    onClick={() => toggleEvent(ev)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      selectedEvents.includes(ev)
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                    }`}>
                    {ev.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button onClick={() => createMut.mutate()}
                disabled={!name || !url || selectedEvents.length === 0 || createMut.isPending}>
                {createMut.isPending ? "Creating…" : "Create Webhook"}
              </Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-slate-100 rounded-lg animate-pulse" />)}
        </div>
      ) : hooks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-400">
            <Webhook className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No outbound webhooks configured</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {hooks.map(h => (
            <Card key={h.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{h.name}</p>
                    <p className="text-xs text-slate-400 font-mono truncate">{h.target_url}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {h.events.map(ev => (
                        <span key={ev} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                          {ev.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-xs"
                      onClick={() => testMut.mutate(h.id)} disabled={testMut.isPending}>
                      <Send className="w-3 h-3" /> Test
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                      onClick={() => deleteMut.mutate(h.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                {h.last_triggered_at && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-400">
                    {h.last_status_code && Number(h.last_status_code) < 400
                      ? <CheckCircle className="w-3 h-3 text-emerald-500" />
                      : <XCircle className="w-3 h-3 text-red-400" />}
                    Last triggered {new Date(h.last_triggered_at).toLocaleString()} · status {h.last_status_code}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
