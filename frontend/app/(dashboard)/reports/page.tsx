"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSessionStore } from "@/store/session";
import { listCampaigns, getAnalytics, type Campaign } from "@/lib/api";
import { getCampaignReport, downloadCampaignCsv, type CampaignReport } from "@/lib/api-features";
import { DashboardShell } from "@/components/dashboard/shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BarChart2, Download, PhoneCall, Target, Clock, TrendingUp, PieChart as PieIcon, FileBarChart, Share2, Check, Settings } from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
} from "recharts";

const OUTCOME_COLORS: Record<string, string> = {
  qualified: "#10b981", not_interested: "#ef4444",
  callback_requested: "#f59e0b", failed: "#94a3b8", unknown: "#cbd5e1",
};

// ─── ROI Types ────────────────────────────────────────────────────────────────
type ROIConfig = {
  avgDealValue: number; closeRate: number;
  humanCallerCostPerHour: number; callsPerHourHuman: number;
  currency: "INR" | "USD";
};
const DEFAULT_ROI: ROIConfig = {
  avgDealValue: 50000, closeRate: 15,
  humanCallerCostPerHour: 350, callsPerHourHuman: 8, currency: "INR",
};

function fmt(n: number, currency: string) {
  if (currency === "INR") {
    if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
    if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
    if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
    return `₹${Math.round(n).toLocaleString("en-IN")}`;
  }
  if (n >= 1000000) return `$${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

// ─── Report Config ────────────────────────────────────────────────────────────
type ReportConfig = {
  clientName: string; agencyName: string; reportTitle: string;
  period: string; accentColor: string; includeROI: boolean;
  includeCalls: boolean; includeLeads: boolean; includeAppointments: boolean;
  customNote: string; avgDealValue: number; closeRate: number; currency: "INR" | "USD";
};
const DEFAULT_REPORT: ReportConfig = {
  clientName: "", agencyName: "", reportTitle: "AI Voice Campaign Report",
  period: "Last 30 Days", accentColor: "#6366f1", includeROI: true,
  includeCalls: true, includeLeads: true, includeAppointments: true,
  customNote: "", avgDealValue: 50000, closeRate: 15, currency: "INR",
};

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const tenantId = useSessionStore(s => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const [tab, setTab] = useState<"campaigns" | "roi" | "client">("campaigns");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [roiConfig, setRoiConfig] = useState<ROIConfig>(DEFAULT_ROI);
  const [reportConfig, setReportConfig] = useState<ReportConfig>(DEFAULT_REPORT);
  const [showROIConfig, setShowROIConfig] = useState(false);
  const [copied, setCopied] = useState(false);
  const [roiDays, setRoiDays] = useState(30);

  useEffect(() => {
    const r = localStorage.getItem("roi_config");
    if (r) setRoiConfig(JSON.parse(r));
    const c = localStorage.getItem("report_config");
    if (c) setReportConfig(JSON.parse(c));
  }, []);

  function saveROIConfig(c: ROIConfig) {
    setRoiConfig(c);
    localStorage.setItem("roi_config", JSON.stringify(c));
    setShowROIConfig(false);
  }

  function updateReport(key: keyof ReportConfig, value: unknown) {
    const updated = { ...reportConfig, [key]: value };
    setReportConfig(updated);
    localStorage.setItem("report_config", JSON.stringify(updated));
  }

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

  const { data: analytics } = useQuery({
    queryKey: ["analytics", tenantId, roiDays],
    queryFn: () => getAnalytics(tenantId, roiDays),
    enabled: Boolean(tenantId) && (tab === "roi" || tab === "client"),
  });

  const outcomesData = Object.entries(report?.outcomes_breakdown ?? {}).map(([k, v]) => ({
    name: k.replace("_", " "), value: v, color: OUTCOME_COLORS[k] ?? "#94a3b8",
  }));

  // ROI Calculations
  const totalCalls = (analytics as unknown as Record<string, number>)?.total_calls ?? 0;
  const qualifiedLeads = (analytics as unknown as Record<string, number>)?.converted_leads ?? 0;
  const appointments = (analytics as unknown as Record<string, number>)?.scheduled_appointments ?? 0;
  const avgDuration = (analytics as unknown as Record<string, number>)?.avg_duration_seconds ?? 0;
  const completionRate = (analytics as unknown as Record<string, number>)?.completion_rate ?? 0;
  const hoursHuman = totalCalls / roiConfig.callsPerHourHuman;
  const humanCost = hoursHuman * roiConfig.humanCallerCostPerHour;
  const totalMinutes = (totalCalls * avgDuration) / 60;
  const aiCost = totalMinutes * (roiConfig.currency === "INR" ? 5.8 : 0.07);
  const estimatedDeals = qualifiedLeads * (roiConfig.closeRate / 100);
  const revenue = estimatedDeals * roiConfig.avgDealValue;
  const savings = humanCost - aiCost;
  const roi = aiCost > 0 ? ((revenue + savings - aiCost) / aiCost) * 100 : 0;
  const curr = roiConfig.currency;

  const TABS = [
    { id: "campaigns", label: "Campaign Reports", icon: BarChart2 },
    { id: "roi", label: "ROI Dashboard", icon: TrendingUp },
    { id: "client", label: "Client Report", icon: FileBarChart },
  ];

  const colors = ["#6366f1","#0ea5e9","#10b981","#f59e0b","#ec4899","#8b5cf6","#ef4444"];

  return (
    <DashboardShell>
      <div style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div className="mb-6">
          <p className="text-sm font-medium text-indigo-600">Analytics</p>
          <h1 className="text-2xl font-bold text-slate-800">Reports</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id as typeof tab)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t.id ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}>
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab 1: Campaign Reports ── */}
        {tab === "campaigns" && (
          <div className="grid lg:grid-cols-4 gap-4">
            <div className="lg:col-span-1 space-y-2">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide px-1">Campaigns</p>
              {campaigns.length === 0 ? (
                <p className="text-sm text-slate-400 px-1">No campaigns yet</p>
              ) : campaigns.map(c => (
                <button key={c.id} onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm border transition-all ${
                    selectedId === c.id ? "border-indigo-400 bg-indigo-50 font-medium" : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}>
                  <p className="truncate">{c.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5 capitalize">{c.status}</p>
                </button>
              ))}
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
                  {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-slate-100 rounded-lg animate-pulse" />)}
                </div>
              ) : report ? (
                <div className="space-y-4">
                  <div className="flex flex-col items-end gap-1">
                    <button
                      onClick={async () => {
                        setExporting(true);
                        setExportError(null);
                        try {
                          await downloadCampaignCsv(tenantId, selectedId!);
                        } catch (err: any) {
                          setExportError(err?.message || "Couldn't export CSV.");
                        } finally {
                          setExporting(false);
                        }
                      }}
                      disabled={exporting}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
                    >
                      <Download className="w-4 h-4" /> {exporting ? "Exporting…" : "Export CSV"}
                    </button>
                    {exportError && <p className="text-xs text-red-600">{exportError}</p>}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatCard icon={<PhoneCall className="w-4 h-4" />} label="Total calls" value={report.total_calls} color="blue" />
                    <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Connection rate" value={`${Math.round(report.connection_rate * 100)}%`} color="emerald" />
                    <StatCard icon={<Target className="w-4 h-4" />} label="Qualified leads" value={report.qualified_leads} color="violet" />
                    <StatCard icon={<Clock className="w-4 h-4" />} label="Avg duration" value={`${report.avg_duration_seconds}s`} color="amber" />
                  </div>
                  <div className="grid lg:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-2"><h3 className="font-semibold text-sm">Call outcomes</h3></CardHeader>
                      <CardContent>
                        {outcomesData.length === 0 ? (
                          <p className="text-sm text-slate-400 text-center py-8">No outcome data</p>
                        ) : (
                          <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                              <Pie data={outcomesData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} innerRadius={40}>
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
                      <CardHeader className="pb-2"><h3 className="font-semibold text-sm">Summary</h3></CardHeader>
                      <CardContent>
                        <dl className="space-y-3 text-sm">
                          {[
                            ["Total calls made", report.total_calls],
                            ["Connected calls", report.connected_calls],
                            ["Qualified leads", report.qualified_leads],
                            ["Avg call duration", `${report.avg_duration_seconds}s`],
                            ["Connection rate", `${Math.round(report.connection_rate * 100)}%`],
                          ].map(([k, v]) => (
                            <div key={String(k)} className="flex justify-between">
                              <dt className="text-slate-500">{k}</dt>
                              <dd className="font-medium">{v}</dd>
                            </div>
                          ))}
                        </dl>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* ── Tab 2: ROI Dashboard ── */}
        {tab === "roi" && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div className="flex gap-2">
                {[7,30,90].map(d => (
                  <button key={d} onClick={() => setRoiDays(d)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${roiDays === d ? "bg-indigo-600 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>
                    {d}d
                  </button>
                ))}
              </div>
              <button onClick={() => setShowROIConfig(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-slate-600 bg-white border border-slate-200 hover:bg-slate-50">
                <Settings className="w-4 h-4" /> Configure
              </button>
            </div>

            {/* Headline */}
            <div className="rounded-2xl p-6 mb-6 text-white relative overflow-hidden"
              style={{ background: "linear-gradient(135deg, #0f0c29, #1a1a4e, #24243e)" }}>
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "linear-gradient(#6366f1 1px, transparent 1px), linear-gradient(90deg, #6366f1 1px, transparent 1px)", backgroundSize: "30px 30px" }} />
              <div className="relative z-10 grid grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { label: "Calls Made by AI", value: totalCalls.toLocaleString(), color: "text-white" },
                  { label: "Estimated Revenue", value: fmt(revenue, curr), color: "text-emerald-400" },
                  { label: "Saved vs Humans", value: fmt(savings > 0 ? savings : 0, curr), color: "text-indigo-300" },
                  { label: "Total ROI", value: roi > 0 ? `${roi.toFixed(0)}%` : "N/A", color: "text-pink-400" },
                ].map(s => (
                  <div key={s.label}>
                    <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-slate-400 text-sm mt-1">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-5">
                  <h3 className="font-bold text-slate-800 mb-4">AI vs Human Callers</h3>
                  <div className="space-y-4">
                    {[
                      { label: "Cost per Qualified Lead", ai: fmt(qualifiedLeads > 0 ? aiCost / qualifiedLeads : 0, curr), human: fmt(qualifiedLeads > 0 ? humanCost / qualifiedLeads : 0, curr), saved: fmt(qualifiedLeads > 0 ? (humanCost - aiCost) / qualifiedLeads : 0, curr) },
                      { label: "Total Calling Cost", ai: fmt(aiCost, curr), human: fmt(humanCost, curr), saved: fmt(savings > 0 ? savings : 0, curr) },
                      { label: "Hours to Complete", ai: `${(totalMinutes / 60).toFixed(1)}h`, human: `${hoursHuman.toFixed(1)}h`, saved: `${(hoursHuman - totalMinutes / 60).toFixed(1)}h` },
                    ].map(c => (
                      <div key={c.label}>
                        <p className="text-xs font-semibold text-slate-500 mb-2">{c.label}</p>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-indigo-50 rounded-lg p-3 text-center">
                            <p className="text-xs text-indigo-600 font-medium mb-1">AI Agent</p>
                            <p className="text-sm font-bold text-indigo-700">{c.ai}</p>
                          </div>
                          <div className="bg-slate-50 rounded-lg p-3 text-center">
                            <p className="text-xs text-slate-500 font-medium mb-1">Human</p>
                            <p className="text-sm font-bold text-slate-600">{c.human}</p>
                          </div>
                          <div className="bg-emerald-50 rounded-lg p-3 text-center">
                            <p className="text-xs text-emerald-600 font-medium mb-1">Saved</p>
                            <p className="text-sm font-bold text-emerald-700">{c.saved}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <h3 className="font-bold text-slate-800 mb-4">Activity Breakdown</h3>
                  <div className="space-y-3">
                    {[
                      { label: "Total Calls", value: totalCalls, pct: 100, color: "#6366f1" },
                      { label: "Qualified Leads", value: qualifiedLeads, pct: totalCalls > 0 ? (qualifiedLeads / totalCalls) * 100 : 0, color: "#10b981" },
                      { label: "Appointments", value: appointments, pct: totalCalls > 0 ? (appointments / totalCalls) * 100 : 0, color: "#f59e0b" },
                      { label: "Est. Deals", value: Math.round(estimatedDeals), pct: totalCalls > 0 ? (estimatedDeals / totalCalls) * 100 : 0, color: "#ec4899" },
                    ].map(item => (
                      <div key={item.label}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-600">{item.label}</span>
                          <span className="font-bold">{item.value.toLocaleString()}</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(item.pct, 100)}%`, background: item.color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-100 space-y-1">
                    <div className="flex justify-between text-sm"><span className="text-slate-500">Conversion rate</span><span className="font-bold">{totalCalls > 0 ? ((qualifiedLeads / totalCalls) * 100).toFixed(1) : 0}%</span></div>
                    <div className="flex justify-between text-sm"><span className="text-slate-500">Avg duration</span><span className="font-bold">{avgDuration}s</span></div>
                    <div className="flex justify-between text-sm"><span className="text-slate-500">Completion rate</span><span className="font-bold">{(completionRate * 100).toFixed(1)}%</span></div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ROI Config Modal */}
            {showROIConfig && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-lg font-bold text-slate-800">ROI Configuration</h2>
                    <button onClick={() => setShowROIConfig(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">✕</button>
                  </div>
                  <ROIConfigForm config={roiConfig} onSave={saveROIConfig} onCancel={() => setShowROIConfig(false)} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Tab 3: Client Report ── */}
        {tab === "client" && (
          <div className="grid lg:grid-cols-5 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-bold text-slate-700 text-sm mb-3">Branding</h3>
                  <div className="space-y-3">
                    {[
                      { key: "agencyName", label: "Your Agency Name", placeholder: "Your Agency" },
                      { key: "clientName", label: "Client Name", placeholder: "Client Company" },
                      { key: "reportTitle", label: "Report Title", placeholder: "AI Voice Campaign Report" },
                      { key: "period", label: "Period Label", placeholder: "Last 30 Days" },
                    ].map(f => (
                      <div key={f.key}>
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">{f.label}</label>
                        <input type="text" placeholder={f.placeholder}
                          value={reportConfig[f.key as keyof ReportConfig] as string}
                          onChange={e => updateReport(f.key as keyof ReportConfig, e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-indigo-400 transition-all" />
                      </div>
                    ))}
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Accent Color</label>
                      <div className="flex gap-2 flex-wrap">
                        {colors.map(c => (
                          <button key={c} onClick={() => updateReport("accentColor", c)}
                            className="w-7 h-7 rounded-full border-2 transition-all"
                            style={{ background: c, borderColor: reportConfig.accentColor === c ? "#1e293b" : "transparent" }} />
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-bold text-slate-700 text-sm mb-3">ROI Settings</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">Currency</label>
                      <select value={reportConfig.currency} onChange={e => updateReport("currency", e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-indigo-400">
                        <option value="INR">₹ Indian Rupee</option>
                        <option value="USD">$ US Dollar</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">Avg Deal Value</label>
                      <input type="number" value={reportConfig.avgDealValue}
                        onChange={e => updateReport("avgDealValue", Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-indigo-400" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">Close Rate (%)</label>
                      <input type="number" value={reportConfig.closeRate} min={1} max={100}
                        onChange={e => updateReport("closeRate", Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-indigo-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-bold text-slate-700 text-sm mb-3">Sections</h3>
                  <div className="space-y-2">
                    {[
                      { key: "includeROI", label: "ROI Summary" },
                      { key: "includeCalls", label: "Call Performance" },
                      { key: "includeLeads", label: "Lead Results" },
                      { key: "includeAppointments", label: "Appointments & Pipeline" },
                    ].map(item => (
                      <label key={item.key} className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={reportConfig[item.key as keyof ReportConfig] as boolean}
                          onChange={e => updateReport(item.key as keyof ReportConfig, e.target.checked)}
                          className="w-4 h-4 rounded accent-indigo-600" />
                        <span className="text-sm text-slate-700">{item.label}</span>
                      </label>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-bold text-slate-700 text-sm mb-3">Custom Note</h3>
                  <textarea value={reportConfig.customNote}
                    onChange={e => updateReport("customNote", e.target.value)}
                    placeholder="Add a personal note to your client..."
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-indigo-400 resize-none" />
                </CardContent>
              </Card>
              <div className="flex gap-2">
                <button onClick={() => window.print()}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white"
                  style={{ background: "linear-gradient(135deg, #6366f1, #7c3aed)" }}>
                  <Download className="w-4 h-4" /> Download PDF
                </button>
                <button onClick={async () => { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50">
                  {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Share2 className="w-4 h-4" />}
                  {copied ? "Copied!" : "Share"}
                </button>
              </div>
            </div>

            {/* Live Preview */}
            <div className="lg:col-span-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Live Preview</p>
              <ClientReportPreview config={reportConfig} analytics={{ totalCalls, qualifiedLeads, appointments, avgDuration, completionRate }} />
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`@media print { nav, aside { display: none !important; } body { background: white !important; } }`}</style>
    </DashboardShell>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function ROIConfigForm({ config, onSave, onCancel }: { config: ROIConfig; onSave: (c: ROIConfig) => void; onCancel: () => void }) {
  const [form, setForm] = useState(config);
  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-semibold text-slate-600 mb-1 block">Currency</label>
        <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value as "INR" | "USD" }))}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-indigo-400">
          <option value="INR">₹ Indian Rupee</option>
          <option value="USD">$ US Dollar</option>
        </select>
      </div>
      {[
        { key: "avgDealValue", label: "Avg Deal Value", hint: "Average revenue per closed deal" },
        { key: "closeRate", label: "Close Rate (%)", hint: "% of qualified leads that close" },
        { key: "humanCallerCostPerHour", label: "Human Caller Cost/hr", hint: "Salary + overhead per hour" },
        { key: "callsPerHourHuman", label: "Human Calls/hr", hint: "Calls a human makes per hour" },
      ].map(f => (
        <div key={f.key}>
          <label className="text-xs font-semibold text-slate-600 mb-1 block">{f.label}</label>
          <input type="number" value={form[f.key as keyof ROIConfig] as number}
            onChange={e => setForm(prev => ({ ...prev, [f.key]: Number(e.target.value) }))}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-indigo-400" />
          <p className="text-xs text-slate-400 mt-0.5">{f.hint}</p>
        </div>
      ))}
      <div className="flex gap-3 pt-1">
        <button onClick={() => onSave(form)} className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg, #6366f1, #7c3aed)" }}>Save</button>
        <button onClick={onCancel} className="px-4 py-2.5 rounded-lg text-sm font-medium text-slate-600 bg-slate-100">Cancel</button>
      </div>
    </div>
  );
}

function ClientReportPreview({ config, analytics }: { config: ReportConfig; analytics: Record<string, number> }) {
  const { totalCalls, qualifiedLeads, appointments, avgDuration, completionRate } = analytics;
  const estimatedDeals = qualifiedLeads * (config.closeRate / 100);
  const revenue = estimatedDeals * config.avgDealValue;
  const aiCost = ((totalCalls * avgDuration) / 60) * (config.currency === "INR" ? 5.8 : 0.07);
  const humanCost = (totalCalls / 8) * 350;
  const savings = humanCost - aiCost;
  const roi = aiCost > 0 ? ((revenue + savings - aiCost) / aiCost) * 100 : 0;
  const curr = config.currency;
  const color = config.accentColor;

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-xl border border-slate-200">
      <div className="p-6" style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
        <div className="flex justify-between mb-6">
          <div>
            {config.agencyName && <p className="text-white/70 text-sm">Prepared by {config.agencyName}</p>}
            {config.clientName && <p className="text-white font-bold">For {config.clientName}</p>}
          </div>
          <p className="text-white/70 text-sm text-right">{config.period}</p>
        </div>
        <h1 className="text-2xl font-bold text-white mb-1">{config.reportTitle}</h1>
        <p className="text-white/60 text-xs">{new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
      </div>

      {config.includeROI && (
        <div className="px-6 py-4 grid grid-cols-4 gap-4 border-b border-slate-100" style={{ background: `${color}08` }}>
          {[
            { emoji: "📞", value: totalCalls.toLocaleString(), label: "Calls Made" },
            { emoji: "💰", value: fmt(revenue, curr), label: "Est. Revenue" },
            { emoji: "📉", value: fmt(savings > 0 ? savings : 0, curr), label: "Cost Saved" },
            { emoji: "🚀", value: `${roi > 0 ? roi.toFixed(0) : 0}%`, label: "ROI" },
          ].map(s => (
            <div key={s.label} className="text-center">
              <p className="text-xl mb-0.5">{s.emoji}</p>
              <p className="text-lg font-bold text-slate-800">{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="p-6 space-y-5">
        {config.includeCalls && (
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color }}>📞 Call Performance</h2>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Total Calls", value: totalCalls.toLocaleString() },
                { label: "Completion Rate", value: `${(completionRate * 100).toFixed(1)}%` },
                { label: "Avg Duration", value: `${avgDuration}s` },
              ].map(s => (
                <div key={s.label} className="rounded-lg p-3 text-center" style={{ background: `${color}08`, border: `1px solid ${color}20` }}>
                  <p className="text-lg font-bold text-slate-800">{s.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {config.includeLeads && (
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color }}>🎯 Lead Results</h2>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Contacts Reached", value: totalCalls.toLocaleString() },
                { label: "Qualified Leads", value: qualifiedLeads.toLocaleString() },
                { label: "Conversion Rate", value: totalCalls > 0 ? `${((qualifiedLeads / totalCalls) * 100).toFixed(1)}%` : "0%" },
              ].map(s => (
                <div key={s.label} className="rounded-lg p-3 text-center" style={{ background: `${color}08`, border: `1px solid ${color}20` }}>
                  <p className="text-lg font-bold text-slate-800">{s.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {config.includeAppointments && (
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color }}>📅 Pipeline</h2>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Appointments", value: appointments.toLocaleString() },
                { label: "Pipeline Value", value: fmt((appointments + qualifiedLeads) * config.avgDealValue * 0.3, curr) },
                { label: "Est. Deals", value: estimatedDeals.toFixed(0) },
              ].map(s => (
                <div key={s.label} className="rounded-lg p-3 text-center" style={{ background: `${color}08`, border: `1px solid ${color}20` }}>
                  <p className="text-lg font-bold text-slate-800">{s.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {config.customNote && (
          <div className="rounded-lg p-4" style={{ background: `${color}08`, border: `1px solid ${color}20` }}>
            <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color }}>Note</p>
            <p className="text-sm text-slate-700">{config.customNote}</p>
          </div>
        )}
        <div className="pt-3 border-t border-slate-100 flex justify-between">
          <p className="text-xs text-slate-400">Powered by Volant AI · {config.agencyName || "Your Agency"}</p>
          <p className="text-xs text-slate-400">{new Date().toLocaleDateString()}</p>
        </div>
      </div>
    </div>
  );
}
