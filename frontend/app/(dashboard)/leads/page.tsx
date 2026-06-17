"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSessionStore } from "@/store/session";
import { listContacts, listContactActivities, type Contact, type LeadActivity } from "@/lib/api";
import { DashboardShell } from "@/components/dashboard/shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, PhoneCall, StickyNote, CalendarCheck, TrendingUp, Search } from "lucide-react";

const LEAD_STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  new:       { bg: "bg-slate-50",   text: "text-slate-600",   border: "border-slate-300" },
  contacted: { bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-300" },
  qualified: { bg: "bg-violet-50",  text: "text-violet-700",  border: "border-violet-300" },
  nurturing: { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-300" },
  converted: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-300" },
  lost:      { bg: "bg-red-50",     text: "text-red-700",     border: "border-red-300" },
};

const ACTIVITY_ICON: Record<string, React.ReactNode> = {
  call:          <PhoneCall className="w-3.5 h-3.5" />,
  note:          <StickyNote className="w-3.5 h-3.5" />,
  status_change: <TrendingUp className="w-3.5 h-3.5" />,
  appointment:   <CalendarCheck className="w-3.5 h-3.5" />,
};

export default function LeadsPage() {
  const tenantId = useSessionStore(s => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ["contacts", tenantId, search],
    queryFn: () => listContacts(tenantId, search),
    enabled: Boolean(tenantId),
  });

  const { data: activities = [] } = useQuery<LeadActivity[]>({
    queryKey: ["activities", tenantId, selectedId],
    queryFn: () => listContactActivities(tenantId, selectedId!),
    enabled: Boolean(selectedId),
  });

  const filtered = statusFilter
    ? contacts.filter(c => c.lead_status === statusFilter)
    : contacts;

  const selectedContact = contacts.find(c => c.id === selectedId);

  return (
    <DashboardShell>
      <div className="mb-6">
        <p className="text-sm font-medium text-blue-700">CRM</p>
        <h2 className="text-2xl font-semibold tracking-tight">Lead Tracking</h2>
      </div>

      {/* Funnel quick-filter */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        <Button size="sm" variant={!statusFilter ? "default" : "ghost"}
          className="h-7 px-3 text-xs" onClick={() => setStatusFilter(undefined)}>
          All ({contacts.length})
        </Button>
        {Object.entries(LEAD_STATUS_COLORS).map(([s, c]) => {
          const count = contacts.filter(ct => ct.lead_status === s).length;
          return (
            <Button key={s} size="sm"
              variant={statusFilter === s ? "default" : "ghost"}
              className={`h-7 px-3 text-xs capitalize border ${statusFilter === s ? "" : `${c.bg} ${c.text} ${c.border}`}`}
              onClick={() => setStatusFilter(statusFilter === s ? undefined : s)}>
              {s} ({count})
            </Button>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Contact list */}
        <div className="lg:col-span-1 space-y-2">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search contacts…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {isLoading ? (
            [...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
            ))
          ) : filtered.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-slate-400 text-sm">No contacts found</CardContent></Card>
          ) : (
            filtered.map(c => {
              const sc = LEAD_STATUS_COLORS[c.lead_status];
              return (
                <button key={c.id}
                  className={`w-full text-left border rounded-lg px-4 py-3 transition-all hover:shadow-sm ${
                    selectedId === c.id ? "border-blue-400 bg-blue-50" : "bg-white border-slate-200"
                  }`}
                  onClick={() => setSelectedId(c.id)}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">
                      {[c.first_name, c.last_name].filter(Boolean).join(" ") || c.phone}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium capitalize ${sc.bg} ${sc.text} ${sc.border}`}>
                      {c.lead_status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                    <span className="font-mono">{c.phone}</span>
                    {c.company && <span>· {c.company}</span>}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Contact detail + activity feed */}
        <div className="lg:col-span-2">
          {!selectedContact ? (
            <Card className="h-full">
              <CardContent className="py-16 text-center text-slate-400">
                <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Select a contact to view their activity</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Contact info card */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-lg">
                        {[selectedContact.first_name, selectedContact.last_name].filter(Boolean).join(" ") || "—"}
                      </h3>
                      <p className="text-sm text-slate-500 font-mono">{selectedContact.phone}</p>
                      {selectedContact.email && <p className="text-sm text-slate-500">{selectedContact.email}</p>}
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full border font-medium capitalize ${LEAD_STATUS_COLORS[selectedContact.lead_status].bg} ${LEAD_STATUS_COLORS[selectedContact.lead_status].text} ${LEAD_STATUS_COLORS[selectedContact.lead_status].border}`}>
                      {selectedContact.lead_status}
                    </span>
                  </div>
                  {(selectedContact.company || selectedContact.source) && (
                    <div className="flex gap-4 mt-3 text-xs text-slate-500">
                      {selectedContact.company && <span>🏢 {selectedContact.company}</span>}
                      {selectedContact.source && <span>📥 Source: {selectedContact.source}</span>}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Activity timeline */}
              <Card>
                <CardHeader className="pb-2">
                  <h3 className="font-semibold text-sm">Activity Timeline</h3>
                </CardHeader>
                <CardContent className="p-0">
                  {activities.length === 0 ? (
                    <p className="text-sm text-slate-400 px-4 py-4">No activities recorded yet.</p>
                  ) : (
                    <ul className="divide-y">
                      {activities.map(a => (
                        <li key={a.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                          <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-slate-500 mt-0.5">
                            {ACTIVITY_ICON[a.activity_type] ?? <TrendingUp className="w-3.5 h-3.5" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium capitalize">{a.activity_type.replace("_", " ")}</p>
                            {a.summary && <p className="text-slate-500 text-xs mt-0.5">{a.summary}</p>}
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {new Date(a.created_at).toLocaleString()}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
