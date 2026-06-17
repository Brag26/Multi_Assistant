"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSessionStore } from "@/store/session";
import { listCampaigns, type Campaign } from "@/lib/api";
import { getCampaignReport, exportCampaignCsv, type CampaignReport } from "@/lib/api-features";
import { DashboardShell } from "@/components/dashboard/shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart2, Download, PhoneCall, Target, Clock, TrendingUp } from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

const OUTCOME_COLORS: Record<string, string> = {
  qualified: "#10b981", not_interested: "#ef4444",
  callback_requested: "#f59e0b", failed: "#94a3b8", unknown: "#cbd5e1",
};

export default function ReportsPage() {
  const tenantId = useSessionStore(s => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: campaigns = [] } = useQuery<Campaign[]>({
    queryKey: ["campaigns", tenantId],
    queryFn: () => listCampaigns(tenantId),
    enabled: Boolean(tenantId),
  });

  const { data: report, isLoading: reportLoading } = useQuery<CampaignReport>({
    queryKey: ["campaign-report", tenantId, selectedId],
    queryFn: () => getCampaignReport(tenantId, selectedId!),
    enabled: Boolean(tenantId) && Boolean(selectedId),
  });

  const outcomesData = Object.entries(report?.outcomes_breakdown ?? {}).map(([k, v]) => ({
    name: k.replace("_", " "), value: v, color: OUTCOME_COLORS[k] ?? "#94a3b8",
  }));

  return (
    <DashboardShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-blue-700">Analytics</p>
          <h2 className="text-2xl font-semibold tracking-tight">Campaign Reports</h2>
        </div>
        {selectedId && report && (
          <a href={exportCampaignCsv(tenantId, selectedId)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            <Download className="w-4 h-4" /> Export CSV
          </a>
        )}
      </div>

      <div className="grid lg:grid-cols-4 gap-4">
        <div className="lg:col-span-1 space-y-2">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide px-1">Campaigns</p>
          {campaigns.length === 0 ? (
            <p className="text-sm text-slate-400 px-1">No campaigns yet</p>
          ) : (
            campaigns.map(c => (
              <button key={c.id}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm border transition-all ${
                  selectedId === c.id ? "border-blue-400 bg-blue-50 font-medium" : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
                onClick={() => setSelectedId(c.id)}>
                <p className="truncate">{c.name}</p>
                <p className="text-xs text-slate-400 mt-0.5 capitalize">{c.status}</p>
              </button>
            ))
          )}
        </div>

        <div className="lg:col-span-3">
          {!selectedId ? (
            <Card className="h-full">
              <CardContent className="py-16 text-center text-slate-400">
                <BarChart2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Select a campaign to view its report</p>
              </CardContent>
            </Card>
          ) : reportLoading ? (
            <div className="grid grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : report ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard icon={<PhoneCall className="w-4 h-4" />} label="Total calls" value={report.total_calls} color="blue" />
                <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Connection rate" value={`${Math.round(report.connection_rate * 100)}%`} color="emerald" />
                <StatCard icon={<Target className="w-4 h-4" />} label="Qualified leads" value={report.qualified_leads} color="violet" />
                <StatCard icon={<Clock className="w-4 h-4" />} label="Avg duration" value={`${report.avg_duration_seconds}s`} color="amber" />
              </div>

              <div className="grid lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <h3 className="font-semibold text-sm">Call outcomes</h3>
                  </CardHeader>
                  <CardContent>
                    {outcomesData.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-8">No outcome data</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie data={outcomesData} dataKey="value" nameKey="name"
                            cx="50%" cy="50%" outerRadius={75} innerRadius={40}>
                            {outcomesData.map((e, i) => <Cell key={i} fill={e.color} />)}
                          </Pie>
                          <Tooltip contentStyle={{ fontSize: 12 }} />
                          <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <h3 className="font-semibold text-sm">Summary</h3>
                  </CardHeader>
                  <CardContent>
                    <dl className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-slate-500">Total calls made</dt>
                        <dd className="font-medium">{report.total_calls}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-500">Connected calls</dt>
                        <dd className="font-medium">{report.connected_calls}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-500">Qualified leads</dt>
                        <dd className="font-medium text-emerald-600">{report.qualified_leads}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-500">Avg call duration</dt>
                        <dd className="font-medium">{report.avg_duration_seconds}s</dd>
                      </div>
                      <div className="flex justify-between border-t pt-2">
                        <dt className="text-slate-500">Connection rate</dt>
                        <dd className={`font-semibold ${report.connection_rate > 0.5 ? "text-emerald-600" : "text-amber-600"}`}>
                          {Math.round(report.connection_rate * 100)}%
                        </dd>
                      </div>
                    </dl>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </DashboardShell>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600", emerald: "bg-emerald-50 text-emerald-600",
    violet: "bg-violet-50 text-violet-600", amber: "bg-amber-50 text-amber-600",
  };
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-2.5">
        <div className={`p-1.5 rounded-lg ${colors[color]}`}>{icon}</div>
        <div>
          <p className="text-lg font-bold leading-tight">{value}</p>
          <p className="text-xs text-slate-500">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
