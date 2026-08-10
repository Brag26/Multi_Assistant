"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { useSessionStore } from "@/store/session";
import { getAnalytics, type Analytics } from "@/lib/api";
import { DashboardShell } from "@/components/dashboard/shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, PhoneCall, Users, CalendarCheck, Target } from "lucide-react";

const OUTCOME_COLORS: Record<string, string> = {
  qualified:          "#10b981",
  not_interested:     "#ef4444",
  callback_requested: "#f59e0b",
  escalated:          "#6366f1",
  failed:             "#94a3b8",
  unknown:            "#cbd5e1",
};

const LEAD_COLORS: Record<string, string> = {
  new:       "#94a3b8",
  contacted: "#60a5fa",
  qualified: "#34d399",
  nurturing: "#fbbf24",
  converted: "#10b981",
  lost:      "#ef4444",
};

export default function AnalyticsPage() {
  const tenantId = useSessionStore(s => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const [days, setDays] = useState(30);

  const { data, isLoading } = useQuery<Analytics>({
    queryKey: ["analytics", tenantId, days],
    queryFn: () => getAnalytics(tenantId, days),
    enabled: Boolean(tenantId),
  });

  const outcomesData = Object.entries(data?.outcomes_breakdown ?? {}).map(([k, v]) => ({
    name: k.replace("_", " "),
    value: v,
    color: OUTCOME_COLORS[k] ?? "#94a3b8",
  }));

  const leadFunnelData = Object.entries(data?.lead_funnel ?? {}).map(([k, v]) => ({
    name: k,
    value: v,
    color: LEAD_COLORS[k] ?? "#94a3b8",
  }));

  const completionPct = data ? Math.round(data.completion_rate * 100) : 0;

  return (
    <DashboardShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-blue-700">Insights</p>
          <h2 className="text-2xl font-semibold tracking-tight">Analytics</h2>
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="h-24 animate-pulse bg-slate-100 rounded-lg m-4" /></Card>
          ))}
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KpiCard icon={<PhoneCall className="w-5 h-5" />} label="Total Calls" value={data?.total_calls ?? 0} color="blue" />
            <KpiCard icon={<Target className="w-5 h-5" />} label="Completion Rate" value={`${completionPct}%`} color="emerald" />
            <KpiCard icon={<Users className="w-5 h-5" />} label="Total Contacts" value={data?.total_contacts ?? 0} color="violet" />
            <KpiCard icon={<CalendarCheck className="w-5 h-5" />} label="Appointments" value={data?.scheduled_appointments ?? 0} color="amber" />
          </div>

          <div className="grid lg:grid-cols-2 gap-4 mb-4">
            {/* Calls per day line chart */}
            <Card>
              <CardHeader className="pb-2">
                <h3 className="font-semibold text-sm flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-blue-500" /> Calls Over Time
                </h3>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={data?.calls_by_day ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="calls" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Lead funnel bar chart */}
            <Card>
              <CardHeader className="pb-2">
                <h3 className="font-semibold text-sm flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-violet-500" /> Lead Funnel
                </h3>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={leadFunnelData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={80} />
                    <Tooltip contentStyle={{ fontSize: 12 }} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {leadFunnelData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            {/* Outcomes pie */}
            <Card>
              <CardHeader className="pb-2">
                <h3 className="font-semibold text-sm">Call Outcomes</h3>
              </CardHeader>
              <CardContent>
                {outcomesData.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">No data yet</p>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={outcomesData} dataKey="value" nameKey="name"
                        cx="50%" cy="50%" outerRadius={75} innerRadius={45}>
                        {outcomesData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 12 }} />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Summary stats */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <h3 className="font-semibold text-sm">Summary</h3>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-4">
                  <StatRow label="Completed calls" value={data?.completed_calls ?? 0} />
                  <StatRow label="Failed calls" value={data?.failed_calls ?? 0} />
                  <StatRow label="Avg duration" value={`${Math.round(data?.avg_duration_seconds ?? 0)}s`} />
                  <StatRow label="Converted leads" value={data?.converted_leads ?? 0} />
                  <StatRow label="Active workflows" value={data?.active_workflows ?? 0} />
                  <StatRow label="Completion rate" value={`${completionPct}%`} highlight={completionPct >= 70} />
                </dl>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </DashboardShell>
  );
}

function KpiCard({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: string | number; color: string;
}) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    violet: "bg-violet-50 text-violet-600",
    amber: "bg-amber-50 text-amber-600",
  };
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2 rounded-lg ${colors[color]}`}>{icon}</div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-slate-500">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatRow({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`text-lg font-semibold ${highlight ? "text-emerald-600" : "text-slate-800"}`}>{value}</dd>
    </div>
  );
}
