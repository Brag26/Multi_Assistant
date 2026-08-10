"use client";

import { useEffect, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { useSessionStore } from "@/store/session";
import { getDashboardSnapshot, listActiveCalls, listNotifications, type DashboardSnapshot } from "@/lib/api";
import { DashboardShell } from "@/components/dashboard/shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PhoneCall, Users, CalendarCheck, Bell, Activity, TrendingUp, AlertCircle, CheckCircle } from "lucide-react";
import { NotificationCenter } from "@/components/dashboard/NotificationCenter";

export default function DashboardPage() {
  const tenantId = useSessionStore(s => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const queryClient = useQueryClient();
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "live" | "polling">("connecting");

  // Poll snapshot every 10s as fallback
  const { data: snapshot } = useQuery<DashboardSnapshot>({
    queryKey: ["dashboard", tenantId],
    queryFn: () => getDashboardSnapshot(tenantId),
    enabled: Boolean(tenantId),
    refetchInterval: 10_000,
  });

  const { data: activeCalls } = useQuery({
    queryKey: ["active-calls", tenantId],
    queryFn: () => listActiveCalls(tenantId),
    enabled: Boolean(tenantId),
    refetchInterval: 8_000,
  });

  // Supabase Realtime subscriptions
  useEffect(() => {
    if (!tenantId) return;
    const supabase = createSupabaseBrowserClient();

    const channel = supabase
      .channel(`dashboard:${tenantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "voice_calls", filter: `tenant_id=eq.${tenantId}` },
        () => { queryClient.invalidateQueries({ queryKey: ["dashboard", tenantId] }); queryClient.invalidateQueries({ queryKey: ["active-calls", tenantId] }); }
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `tenant_id=eq.${tenantId}` },
        () => queryClient.invalidateQueries({ queryKey: ["notifications", tenantId] })
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `tenant_id=eq.${tenantId}` },
        () => queryClient.invalidateQueries({ queryKey: ["dashboard", tenantId] })
      )
      .subscribe(status => {
        setRealtimeStatus(status === "SUBSCRIBED" ? "live" : "polling");
      });

    return () => { supabase.removeChannel(channel); };
  }, [tenantId, queryClient]);

  const stats = [
    {
      label: "Active Calls",
      value: activeCalls?.length ?? snapshot?.active_calls ?? 0,
      icon: <PhoneCall className="w-5 h-5" />,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "Calls Today",
      value: snapshot?.calls_today ?? 0,
      icon: <Activity className="w-5 h-5" />,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Leads Today",
      value: snapshot?.leads_today ?? 0,
      icon: <Users className="w-5 h-5" />,
      color: "text-violet-600",
      bg: "bg-violet-50",
    },
    {
      label: "Appts Today",
      value: snapshot?.appointments_today ?? 0,
      icon: <CalendarCheck className="w-5 h-5" />,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
  ];

  return (
    <DashboardShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-blue-700">Overview</p>
          <h2 className="text-2xl font-semibold tracking-tight">Real-Time Dashboard</h2>
        </div>
        <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${
          realtimeStatus === "live" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${realtimeStatus === "live" ? "bg-emerald-500" : "bg-amber-500"}`} />
          {realtimeStatus === "live" ? "Live" : realtimeStatus === "polling" ? "Polling" : "Connecting"}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map(s => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${s.bg}`}>
                <span className={s.color}>{s.icon}</span>
              </div>
              <div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Active calls feed */}
        <div className="lg:col-span-2 space-y-3">
          <h3 className="font-semibold text-sm text-slate-700">Active Calls</h3>
          {(!activeCalls || activeCalls.length === 0) ? (
            <Card>
              <CardContent className="py-8 text-center text-slate-400 text-sm">
                No calls in progress
              </CardContent>
            </Card>
          ) : (
            activeCalls.map(call => (
              <Card key={call.id} className="border-l-4 border-l-emerald-500">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                      <PhoneCall className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{call.customer_phone}</p>
                      <p className="text-xs text-slate-500">
                        {call.started_at ? `Started ${new Date(call.started_at).toLocaleTimeString()}` : "Starting…"}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                    {call.status}
                  </span>
                </CardContent>
              </Card>
            ))
          )}

          {/* Recent calls */}
          <h3 className="font-semibold text-sm text-slate-700 pt-2">Recent Calls</h3>
          {snapshot?.recent_calls?.length ? (
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-slate-500">
                      <th className="px-4 py-2.5">Phone</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5">Outcome</th>
                      <th className="px-4 py-2.5">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.recent_calls.map(c => (
                      <tr key={c.id} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-mono text-xs">{c.customer_phone}</td>
                        <td className="px-4 py-2.5">
                          <StatusBadge status={c.status} />
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-500 capitalize">{c.outcome?.replace("_", " ")}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-500">
                          {c.duration_seconds ? `${c.duration_seconds}s` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ) : (
            <Card><CardContent className="py-6 text-center text-slate-400 text-sm">No recent calls</CardContent></Card>
          )}
        </div>

        {/* Notification panel */}
        <div>
          <h3 className="font-semibold text-sm text-slate-700 mb-3 flex items-center gap-1.5">
            <Bell className="w-4 h-4" /> Notifications
          </h3>
          <NotificationCenter tenantId={tenantId} compact />
        </div>
      </div>
    </DashboardShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "bg-emerald-50 text-emerald-700",
    failed: "bg-red-50 text-red-700",
    in_progress: "bg-blue-50 text-blue-700",
    queued: "bg-slate-100 text-slate-600",
    canceled: "bg-slate-100 text-slate-500",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status] ?? "bg-slate-100 text-slate-600"}`}>
      {status.replace("_", " ")}
    </span>
  );
}
