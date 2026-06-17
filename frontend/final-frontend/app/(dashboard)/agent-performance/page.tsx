"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSessionStore } from "@/store/session";
import { apiFetch } from "@/lib/api";
import { DashboardShell } from "@/components/dashboard/shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trophy, PhoneCall, Target, Clock, User } from "lucide-react";

interface AgentStat {
  agent_id: string;
  email: string;
  total_calls: number;
  completed_calls: number;
  qualified_calls: number;
  completion_rate: number;
  conversion_rate: number;
  avg_handle_time_seconds: number;
}

interface AgentPerformanceResponse {
  agents: AgentStat[];
  unassigned_calls: number;
  period_days: number;
}

export default function AgentPerformancePage() {
  const tenantId = useSessionStore(s => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const [days, setDays] = useState(30);

  const { data, isLoading } = useQuery<AgentPerformanceResponse>({
    queryKey: ["agent-performance", tenantId, days],
    queryFn: () => apiFetch(`/tenants/${tenantId}/agent-performance?days=${days}`),
    enabled: Boolean(tenantId),
  });

  const agents = data?.agents ?? [];
  const top = agents[0];

  return (
    <DashboardShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-blue-700">Team</p>
          <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Trophy className="w-6 h-6" /> Agent Performance
          </h2>
        </div>
        <div className="flex gap-1.5">
          {[7, 14, 30, 90].map(d => (
            <Button key={d} size="sm" variant={days === d ? "default" : "ghost"}
              className="h-7 px-3 text-xs" onClick={() => setDays(d)}>
              {d}d
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />)}
        </div>
      ) : agents.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-slate-400">
            <User className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No agent-assigned calls yet</p>
            <p className="text-xs mt-1">Calls need an assigned_agent_id in metadata to appear here</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {top && (
            <Card className="mb-4 border-l-4 border-l-amber-400 bg-gradient-to-r from-amber-50 to-transparent">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                  <Trophy className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-amber-700 font-medium uppercase tracking-wide">Top performer</p>
                  <p className="font-semibold">{top.email}</p>
                  <p className="text-sm text-slate-500">{top.qualified_calls} qualified leads · {Math.round(top.conversion_rate * 100)}% conversion</p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-slate-500">
                    <th className="px-4 py-3">Agent</th>
                    <th className="px-4 py-3">Total calls</th>
                    <th className="px-4 py-3">Completed</th>
                    <th className="px-4 py-3">Qualified</th>
                    <th className="px-4 py-3">Conversion</th>
                    <th className="px-4 py-3">Avg handle time</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a, i) => (
                    <tr key={a.agent_id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-2.5 flex items-center gap-2">
                        {i === 0 && <Trophy className="w-3.5 h-3.5 text-amber-500" />}
                        <span className="font-medium">{a.email}</span>
                      </td>
                      <td className="px-4 py-2.5">{a.total_calls}</td>
                      <td className="px-4 py-2.5">{a.completed_calls}</td>
                      <td className="px-4 py-2.5 font-medium text-emerald-600">{a.qualified_calls}</td>
                      <td className="px-4 py-2.5">{Math.round(a.conversion_rate * 100)}%</td>
                      <td className="px-4 py-2.5 text-slate-500">{Math.round(a.avg_handle_time_seconds)}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {data && data.unassigned_calls > 0 && (
            <p className="text-xs text-slate-400 mt-3">
              {data.unassigned_calls} calls in this period had no assigned agent and are excluded from this leaderboard.
            </p>
          )}
        </>
      )}
    </DashboardShell>
  );
}
