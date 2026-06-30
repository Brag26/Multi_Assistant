"use client";

import { useState, useRef, useEffect } from "react";
import { useSessionStore } from "@/store/session";
import { getAnalytics } from "@/lib/api";
import { DashboardShell } from "@/components/dashboard/shell";
import { Card, CardContent } from "@/components/ui/card";
import {
  Download, Share2, Check, PhoneCall, Users,
  Calendar, TrendingUp, Target, IndianRupee,
  ArrowUpRight, Building2, Mail, Globe,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportConfig = {
  clientName: string;
  clientLogo: string;
  agencyName: string;
  agencyLogo: string;
  reportTitle: string;
  period: string;
  accentColor: string;
  includeROI: boolean;
  includeCalls: boolean;
  includeLeads: boolean;
  includeAppointments: boolean;
  customNote: string;
  avgDealValue: number;
  closeRate: number;
  currency: "INR" | "USD";
};

const DEFAULT_CONFIG: ReportConfig = {
  clientName: "",
  clientLogo: "",
  agencyName: "",
  agencyLogo: "",
  reportTitle: "AI Voice Campaign Report",
  period: "Last 30 Days",
  accentColor: "#6366f1",
  includeROI: true,
  includeCalls: true,
  includeLeads: true,
  includeAppointments: true,
  customNote: "",
  avgDealValue: 50000,
  closeRate: 15,
  currency: "INR",
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

// ─── Report Preview Component ─────────────────────────────────────────────────

function ReportPreview({ config, analytics }: { config: ReportConfig; analytics: Record<string, number> }) {
  const totalCalls = analytics.total_calls ?? 0;
  const qualifiedLeads = analytics.converted_leads ?? 0;
  const appointments = analytics.scheduled_appointments ?? 0;
  const completionRate = analytics.completion_rate ?? 0;
  const avgDuration = analytics.avg_duration_seconds ?? 0;

  const estimatedDeals = qualifiedLeads * (config.closeRate / 100);
  const revenueGenerated = estimatedDeals * config.avgDealValue;
  const humanCost = (totalCalls / 8) * 350;
  const aiCost = ((totalCalls * avgDuration) / 60) * (config.currency === "INR" ? 5.8 : 0.07);
  const savings = humanCost - aiCost;
  const roiPercent = aiCost > 0 ? ((revenueGenerated + savings - aiCost) / aiCost) * 100 : 0;

  const curr = config.currency;
  const color = config.accentColor;

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-xl border border-slate-200" id="report-preview">

      {/* Header */}
      <div className="p-8" style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
        <div className="flex items-start justify-between mb-8">
          <div>
            {config.agencyName && (
              <p className="text-white/70 text-sm font-medium mb-1">Prepared by {config.agencyName}</p>
            )}
            {config.clientName && (
              <p className="text-white text-lg font-bold">Report for {config.clientName}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-white/70 text-xs">Campaign Period</p>
            <p className="text-white font-semibold">{config.period}</p>
          </div>
        </div>

        <h1 className="text-3xl font-bold text-white mb-2">{config.reportTitle}</h1>
        <p className="text-white/70 text-sm">Generated on {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
      </div>

      {/* ROI Headline */}
      {config.includeROI && (
        <div className="px-8 py-6 border-b border-slate-100" style={{ background: `${color}08` }}>
          <div className="grid grid-cols-4 gap-6">
            {[
              { label: "Calls Made", value: totalCalls.toLocaleString(), icon: "📞" },
              { label: "Est. Revenue", value: fmt(revenueGenerated, curr), icon: "💰" },
              { label: "Cost Saved", value: fmt(savings > 0 ? savings : 0, curr), icon: "📉" },
              { label: "ROI", value: `${roiPercent > 0 ? roiPercent.toFixed(0) : 0}%`, icon: "🚀" },
            ].map(stat => (
              <div key={stat.label} className="text-center">
                <p className="text-2xl mb-1">{stat.icon}</p>
                <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
                <p className="text-xs text-slate-500 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="p-8 space-y-6">

        {/* Call Performance */}
        {config.includeCalls && (
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest mb-4" style={{ color }}>
              📞 Call Performance
            </h2>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Total Calls", value: totalCalls.toLocaleString() },
                { label: "Completion Rate", value: `${(completionRate * 100).toFixed(1)}%` },
                { label: "Avg Duration", value: `${avgDuration}s` },
              ].map(s => (
                <div key={s.label} className="rounded-xl p-4 text-center" style={{ background: `${color}08`, border: `1px solid ${color}20` }}>
                  <p className="text-2xl font-bold text-slate-800">{s.value}</p>
                  <p className="text-xs text-slate-500 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Lead Results */}
        {config.includeLeads && (
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest mb-4" style={{ color }}>
              🎯 Lead Results
            </h2>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Total Contacts Reached", value: totalCalls.toLocaleString() },
                { label: "Qualified Leads", value: qualifiedLeads.toLocaleString() },
                { label: "Conversion Rate", value: totalCalls > 0 ? `${((qualifiedLeads / totalCalls) * 100).toFixed(1)}%` : "0%" },
              ].map(s => (
                <div key={s.label} className="rounded-xl p-4 text-center" style={{ background: `${color}08`, border: `1px solid ${color}20` }}>
                  <p className="text-2xl font-bold text-slate-800">{s.value}</p>
                  <p className="text-xs text-slate-500 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Appointments */}
        {config.includeAppointments && (
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest mb-4" style={{ color }}>
              📅 Appointments & Pipeline
            </h2>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Appointments Booked", value: appointments.toLocaleString() },
                { label: "Est. Pipeline Value", value: fmt((appointments + qualifiedLeads) * config.avgDealValue * 0.3, curr) },
                { label: "Est. Deals to Close", value: estimatedDeals.toFixed(0) },
              ].map(s => (
                <div key={s.label} className="rounded-xl p-4 text-center" style={{ background: `${color}08`, border: `1px solid ${color}20` }}>
                  <p className="text-2xl font-bold text-slate-800">{s.value}</p>
                  <p className="text-xs text-slate-500 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ROI Breakdown */}
        {config.includeROI && (
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest mb-4" style={{ color }}>
              💹 ROI Breakdown
            </h2>
            <div className="rounded-xl overflow-hidden border border-slate-200">
              {[
                { label: "Estimated Revenue Generated", value: fmt(revenueGenerated, curr), positive: true },
                { label: "Cost Savings vs Human Callers", value: fmt(savings > 0 ? savings : 0, curr), positive: true },
                { label: "AI Calling Cost", value: fmt(aiCost, curr), positive: false },
                { label: "Net Return", value: fmt(revenueGenerated + (savings > 0 ? savings : 0) - aiCost, curr), positive: true, bold: true },
              ].map((row, i) => (
                <div key={row.label}
                  className={`flex items-center justify-between px-4 py-3 ${i % 2 === 0 ? "bg-slate-50" : "bg-white"} ${row.bold ? "border-t border-slate-200" : ""}`}>
                  <span className={`text-sm ${row.bold ? "font-bold text-slate-800" : "text-slate-600"}`}>{row.label}</span>
                  <span className={`text-sm font-bold ${row.bold ? "text-lg" : ""} ${row.positive ? "text-emerald-600" : "text-slate-500"}`}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Custom Note */}
        {config.customNote && (
          <div className="rounded-xl p-4" style={{ background: `${color}08`, border: `1px solid ${color}20` }}>
            <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color }}>Note from your team</p>
            <p className="text-sm text-slate-700 leading-relaxed">{config.customNote}</p>
          </div>
        )}

        {/* Footer */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
          <p className="text-xs text-slate-400">
            Powered by VoiceOps AI · {config.agencyName || "Your Agency"}
          </p>
          <p className="text-xs text-slate-400">
            {new Date().toLocaleDateString()}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ClientReportPage() {
  const tenantId = useSessionStore(s => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const [config, setConfig] = useState<ReportConfig>(DEFAULT_CONFIG);
  const [days, setDays] = useState(30);
  const [analytics, setAnalytics] = useState<Record<string, number>>({});
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    getAnalytics(tenantId, days)
      .then(d => setAnalytics(d as unknown as Record<string, number>))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tenantId, days]);

  // Load saved config
  useEffect(() => {
    const saved = localStorage.getItem("report_config");
    if (saved) setConfig(JSON.parse(saved));
  }, []);

  function update(key: keyof ReportConfig, value: unknown) {
    const updated = { ...config, [key]: value };
    setConfig(updated);
    localStorage.setItem("report_config", JSON.stringify(updated));
  }

  async function handlePrint() {
    window.print();
  }

  async function handleCopyLink() {
    const url = `${window.location.origin}/reports/client?tenant=${tenantId}&days=${days}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const colors = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#ef4444"];

  return (
    <DashboardShell>
      <div style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-sm font-medium text-indigo-600">Reports</p>
            <h1 className="text-2xl font-bold text-slate-800">Client Report Generator</h1>
            <p className="text-sm text-slate-500 mt-0.5">Generate a beautiful white-labeled report for your clients</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={days} onChange={e => setDays(Number(e.target.value))}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 outline-none bg-white">
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <button onClick={handleCopyLink}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors">
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Share2 className="w-4 h-4" />}
              {copied ? "Copied!" : "Share Link"}
            </button>
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white transition-all"
              style={{ background: "linear-gradient(135deg, #6366f1, #7c3aed)" }}>
              <Download className="w-4 h-4" /> Download PDF
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-5 gap-6">

          {/* Config Panel */}
          <div className="lg:col-span-2 space-y-4">

            {/* Branding */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-bold text-slate-700 text-sm mb-3 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-indigo-600" /> Branding
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Your Agency Name</label>
                    <input type="text" placeholder="Your Agency" value={config.agencyName}
                      onChange={e => update("agencyName", e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-indigo-400 transition-all" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Client Name</label>
                    <input type="text" placeholder="Client Company Name" value={config.clientName}
                      onChange={e => update("clientName", e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-indigo-400 transition-all" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Report Title</label>
                    <input type="text" value={config.reportTitle}
                      onChange={e => update("reportTitle", e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-indigo-400 transition-all" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Period Label</label>
                    <input type="text" value={config.period}
                      onChange={e => update("period", e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-indigo-400 transition-all" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Accent Color</label>
                    <div className="flex gap-2 flex-wrap">
                      {colors.map(c => (
                        <button key={c} onClick={() => update("accentColor", c)}
                          className="w-8 h-8 rounded-full border-2 transition-all"
                          style={{ background: c, borderColor: config.accentColor === c ? "#1e293b" : "transparent" }} />
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ROI Settings */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-bold text-slate-700 text-sm mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-indigo-600" /> ROI Settings
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Currency</label>
                    <select value={config.currency} onChange={e => update("currency", e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-indigo-400 transition-all">
                      <option value="INR">₹ Indian Rupee</option>
                      <option value="USD">$ US Dollar</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">
                      Avg Deal Value ({config.currency === "INR" ? "₹" : "$"})
                    </label>
                    <input type="number" value={config.avgDealValue}
                      onChange={e => update("avgDealValue", Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-indigo-400 transition-all" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Close Rate (%)</label>
                    <input type="number" value={config.closeRate} min={1} max={100}
                      onChange={e => update("closeRate", Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-indigo-400 transition-all" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Sections */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-bold text-slate-700 text-sm mb-3">Sections to Include</h3>
                <div className="space-y-2">
                  {[
                    { key: "includeROI", label: "ROI Summary" },
                    { key: "includeCalls", label: "Call Performance" },
                    { key: "includeLeads", label: "Lead Results" },
                    { key: "includeAppointments", label: "Appointments & Pipeline" },
                  ].map(item => (
                    <label key={item.key} className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox"
                        checked={config[item.key as keyof ReportConfig] as boolean}
                        onChange={e => update(item.key as keyof ReportConfig, e.target.checked)}
                        className="w-4 h-4 rounded accent-indigo-600" />
                      <span className="text-sm text-slate-700">{item.label}</span>
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Custom Note */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-bold text-slate-700 text-sm mb-3 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-indigo-600" /> Custom Note
                </h3>
                <textarea value={config.customNote}
                  onChange={e => update("customNote", e.target.value)}
                  placeholder="Add a personal note or message to your client..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-indigo-400 transition-all resize-none" />
              </CardContent>
            </Card>
          </div>

          {/* Report Preview */}
          <div className="lg:col-span-3">
            <div className="sticky top-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Live Preview</p>
              {loading ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                  <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-sm text-slate-400">Loading data...</p>
                </div>
              ) : (
                <ReportPreview config={config} analytics={analytics} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          nav, aside, header, .no-print { display: none !important; }
          #report-preview { box-shadow: none !important; }
          body { background: white !important; }
        }
      `}</style>
    </DashboardShell>
  );
}