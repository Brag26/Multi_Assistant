"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSessionStore } from "@/store/session";
import { getAnalytics } from "@/lib/api";
import { DashboardShell } from "@/components/dashboard/shell";
import { Card, CardContent } from "@/components/ui/card";
import {
  TrendingUp, IndianRupee, PhoneCall, Users, Calendar,
  Target, ArrowUpRight, Info, Download, Share2,
} from "lucide-react";

// ─── ROI Config form ─────────────────────────────────────────────────────────

type ROIConfig = {
  avgDealValue: number;
  closeRate: number;
  humanCallerCostPerHour: number;
  callsPerHourHuman: number;
  currency: "INR" | "USD";
};

const DEFAULT_CONFIG: ROIConfig = {
  avgDealValue: 50000,
  closeRate: 15,
  humanCallerCostPerHour: 350,
  callsPerHourHuman: 8,
  currency: "INR",
};

function fmt(n: number, currency: string) {
  if (currency === "INR") {
    if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
    if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
    if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
    return `₹${n.toLocaleString("en-IN")}`;
  }
  if (n >= 1000000) return `$${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

export default function ROIDashboardPage() {
  const tenantId = useSessionStore(s => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const [config, setConfig] = useState<ROIConfig>(DEFAULT_CONFIG);
  const [showConfig, setShowConfig] = useState(false);
  const [days, setDays] = useState(30);

  // Load saved config
  useEffect(() => {
    const saved = localStorage.getItem("roi_config");
    if (saved) setConfig(JSON.parse(saved));
  }, []);

  function saveConfig(c: ROIConfig) {
    setConfig(c);
    localStorage.setItem("roi_config", JSON.stringify(c));
    setShowConfig(false);
  }

  const { data: analytics, isLoading } = useQuery({
    queryKey: ["analytics", tenantId, days],
    queryFn: () => getAnalytics(tenantId, days),
    enabled: Boolean(tenantId),
  });

  // ── ROI Calculations ──────────────────────────────────────────────────────
  const totalCalls = analytics?.total_calls ?? 0;
  const qualifiedLeads = analytics?.converted_leads ?? 0;
  const appointments = analytics?.scheduled_appointments ?? 0;
  const avgDuration = analytics?.avg_duration_seconds ?? 0;

  // Human caller cost
  const hoursHumanWouldTake = totalCalls / config.callsPerHourHuman;
  const humanCallerCost = hoursHumanWouldTake * config.humanCallerCostPerHour;

  // AI caller cost estimate (Vapi ~$0.05/min + telephony ~$0.02/min)
  const totalMinutes = (totalCalls * avgDuration) / 60;
  const aiCallerCost = totalMinutes * 0.07; // ~₹5.8/min in INR equivalent
  const aiCallerCostINR = config.currency === "INR" ? aiCallerCost * 83 : aiCallerCost;

  // Revenue generated
  const estimatedDeals = qualifiedLeads * (config.closeRate / 100);
  const revenueGenerated = estimatedDeals * config.avgDealValue;

  // Pipeline value (appointments + qualified leads not yet closed)
  const pipelineValue = (appointments + qualifiedLeads) * config.avgDealValue * 0.3;

  // Savings
  const moneySaved = humanCallerCost - aiCallerCostINR;
  const costPerLead = qualifiedLeads > 0 ? aiCallerCostINR / qualifiedLeads : 0;
  const humanCostPerLead = qualifiedLeads > 0 ? humanCallerCost / qualifiedLeads : 0;

  // ROI %
  const totalInvestment = aiCallerCostINR || 1;
  const totalReturn = revenueGenerated + moneySaved;
  const roiPercent = ((totalReturn - totalInvestment) / totalInvestment) * 100;

  const curr = config.currency;

  const kpis = [
    {
      label: "Revenue Generated",
      value: fmt(revenueGenerated, curr),
      sub: `${estimatedDeals.toFixed(0)} estimated deals closed`,
      icon: IndianRupee,
      color: "#10b981",
      bg: "#f0fdf4",
      trend: "+",
    },
    {
      label: "Cost Savings",
      value: fmt(moneySaved, curr),
      sub: `vs hiring human callers`,
      icon: TrendingUp,
      color: "#6366f1",
      bg: "#eef2ff",
      trend: "+",
    },
    {
      label: "Pipeline Value",
      value: fmt(pipelineValue, curr),
      sub: `${appointments + qualifiedLeads} active opportunities`,
      icon: Target,
      color: "#f59e0b",
      bg: "#fffbeb",
      trend: "+",
    },
    {
      label: "ROI",
      value: `${roiPercent > 0 ? roiPercent.toFixed(0) : 0}%`,
      sub: `Every ₹1 returns ₹${roiPercent > 0 ? (roiPercent / 100 + 1).toFixed(1) : "0"}`,
      icon: ArrowUpRight,
      color: "#ec4899",
      bg: "#fdf4ff",
      trend: roiPercent > 0 ? "+" : "",
    },
  ];

  const comparisons = [
    {
      label: "Cost per Qualified Lead",
      ai: fmt(costPerLead, curr),
      human: fmt(humanCostPerLead, curr),
      saving: fmt(humanCostPerLead - costPerLead, curr),
      better: costPerLead < humanCostPerLead,
    },
    {
      label: "Total Calling Cost",
      ai: fmt(aiCallerCostINR, curr),
      human: fmt(humanCallerCost, curr),
      saving: fmt(humanCallerCost - aiCallerCostINR, curr),
      better: aiCallerCostINR < humanCallerCost,
    },
    {
      label: "Hours to Complete",
      ai: `${(totalMinutes / 60).toFixed(1)}h`,
      human: `${hoursHumanWouldTake.toFixed(1)}h`,
      saving: `${(hoursHumanWouldTake - totalMinutes / 60).toFixed(1)}h saved`,
      better: true,
    },
  ];

  return (
    <DashboardShell>
      <div style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-sm font-medium text-indigo-600">ROI Dashboard</p>
            <h1 className="text-2xl font-bold text-slate-800">Return on Investment</h1>
            <p className="text-sm text-slate-500 mt-0.5">See exactly how much your AI agents are making you</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={days} onChange={e => setDays(Number(e.target.value))}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 outline-none bg-white">
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <button onClick={() => setShowConfig(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors">
              <Info className="w-4 h-4" /> Configure
            </button>
            <a href="/reports/client"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white transition-all"
              style={{ background: "linear-gradient(135deg, #6366f1, #7c3aed)" }}>
              <Share2 className="w-4 h-4" /> Client Report
            </a>
          </div>
        </div>

        {/* ROI Headline Banner */}
        <div className="rounded-2xl p-6 mb-6 text-white relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, #0f0c29, #1a1a4e, #24243e)" }}>
          <div className="absolute inset-0 opacity-10"
            style={{ backgroundImage: "linear-gradient(#6366f1 1px, transparent 1px), linear-gradient(90deg, #6366f1 1px, transparent 1px)", backgroundSize: "30px 30px" }} />
          <div className="relative z-10">
            <p className="text-indigo-300 text-sm font-semibold uppercase tracking-widest mb-2">
              {days}-Day Performance Summary
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <p className="text-4xl font-bold text-white">{totalCalls.toLocaleString()}</p>
                <p className="text-slate-400 text-sm mt-1">Calls Made by AI</p>
              </div>
              <div>
                <p className="text-4xl font-bold text-emerald-400">{fmt(revenueGenerated, curr)}</p>
                <p className="text-slate-400 text-sm mt-1">Estimated Revenue</p>
              </div>
              <div>
                <p className="text-4xl font-bold text-indigo-300">{fmt(moneySaved, curr)}</p>
                <p className="text-slate-400 text-sm mt-1">Saved vs Human Callers</p>
              </div>
              <div>
                <p className="text-4xl font-bold text-pink-400">
                  {roiPercent > 0 ? `${roiPercent.toFixed(0)}%` : "N/A"}
                </p>
                <p className="text-slate-400 text-sm mt-1">Total ROI</p>
              </div>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {kpis.map(kpi => (
            <Card key={kpi.label}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-medium text-slate-500">{kpi.label}</p>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: kpi.bg }}>
                    <kpi.icon className="w-4 h-4" style={{ color: kpi.color }} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-slate-800">{kpi.value}</p>
                <p className="text-xs text-slate-500 mt-1">{kpi.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-4 mb-6">
          {/* AI vs Human Comparison */}
          <Card>
            <CardContent className="p-5">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-600" /> AI vs Human Callers
              </h3>
              <div className="space-y-4">
                {comparisons.map(c => (
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
                        <p className="text-sm font-bold text-emerald-700">{c.saving}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Activity Summary */}
          <Card>
            <CardContent className="p-5">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Target className="w-4 h-4 text-indigo-600" /> Activity Breakdown
              </h3>
              <div className="space-y-3">
                {[
                  { label: "Total Calls", value: totalCalls, icon: PhoneCall, color: "#6366f1", pct: 100 },
                  { label: "Qualified Leads", value: qualifiedLeads, icon: Users, color: "#10b981", pct: totalCalls > 0 ? (qualifiedLeads / totalCalls) * 100 : 0 },
                  { label: "Appointments Booked", value: appointments, icon: Calendar, color: "#f59e0b", pct: totalCalls > 0 ? (appointments / totalCalls) * 100 : 0 },
                  { label: "Estimated Deals", value: Math.round(estimatedDeals), icon: Target, color: "#ec4899", pct: totalCalls > 0 ? (estimatedDeals / totalCalls) * 100 : 0 },
                ].map(item => (
                  <div key={item.label}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <item.icon className="w-3.5 h-3.5" style={{ color: item.color }} />
                        <span className="text-sm text-slate-600">{item.label}</span>
                      </div>
                      <span className="text-sm font-bold text-slate-800">{item.value.toLocaleString()}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(item.pct, 100)}%`, background: item.color }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Conversion rate</span>
                  <span className="font-bold text-slate-800">
                    {totalCalls > 0 ? ((qualifiedLeads / totalCalls) * 100).toFixed(1) : 0}%
                  </span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-slate-500">Avg call duration</span>
                  <span className="font-bold text-slate-800">{avgDuration}s</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-slate-500">Total talk time</span>
                  <span className="font-bold text-slate-800">{(totalMinutes / 60).toFixed(1)} hours</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Config Modal */}
        {showConfig && (
          <ROIConfigModal config={config} onSave={saveConfig} onClose={() => setShowConfig(false)} />
        )}
      </div>
    </DashboardShell>
  );
}

// ─── Config Modal ─────────────────────────────────────────────────────────────

function ROIConfigModal({ config, onSave, onClose }: {
  config: ROIConfig;
  onSave: (c: ROIConfig) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState(config);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-slate-800">ROI Configuration</h2>
            <p className="text-xs text-slate-500 mt-0.5">Customize calculations to match your business</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">✕</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Currency</label>
            <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value as "INR" | "USD" }))}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm outline-none focus:border-indigo-400 transition-all">
              <option value="INR">₹ Indian Rupee (INR)</option>
              <option value="USD">$ US Dollar (USD)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Average Deal Value ({form.currency === "INR" ? "₹" : "$"})
            </label>
            <input type="number" value={form.avgDealValue}
              onChange={e => setForm(f => ({ ...f, avgDealValue: Number(e.target.value) }))}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm outline-none focus:border-indigo-400 transition-all" />
            <p className="text-xs text-slate-400 mt-1">Average revenue per closed deal</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Close Rate (%)</label>
            <input type="number" value={form.closeRate} min={1} max={100}
              onChange={e => setForm(f => ({ ...f, closeRate: Number(e.target.value) }))}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm outline-none focus:border-indigo-400 transition-all" />
            <p className="text-xs text-slate-400 mt-1">% of qualified leads that become deals</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Human Caller Cost per Hour ({form.currency === "INR" ? "₹" : "$"})
            </label>
            <input type="number" value={form.humanCallerCostPerHour}
              onChange={e => setForm(f => ({ ...f, humanCallerCostPerHour: Number(e.target.value) }))}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm outline-none focus:border-indigo-400 transition-all" />
            <p className="text-xs text-slate-400 mt-1">Salary + overhead per hour for a human caller</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Human Calls per Hour</label>
            <input type="number" value={form.callsPerHourHuman}
              onChange={e => setForm(f => ({ ...f, callsPerHourHuman: Number(e.target.value) }))}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm outline-none focus:border-indigo-400 transition-all" />
            <p className="text-xs text-slate-400 mt-1">How many calls a human can make per hour</p>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={() => onSave(form)}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-all"
            style={{ background: "linear-gradient(135deg, #6366f1, #7c3aed)" }}>
            Save Configuration
          </button>
          <button onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}