"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles, Check, X, RefreshCw, Clock, ShieldCheck } from "lucide-react";
import { useSessionStore } from "@/store/session";
import {
  runAutopilotNow, listAutopilotActions, listAutopilotRuns,
  approveAutopilotAction, rejectAutopilotAction,
  type AutopilotAction, type AutopilotRun,
} from "@/lib/api";
import { SpotlightCard, CountUp, AuroraBackground } from "@/components/dashboard/FancyUI";

const CHECK_ICONS: Record<string, string> = {
  minute_limit: "⏱️", stuck_campaign: "⚠️", failed_payment: "💳",
};

export default function AutopilotPage() {
  const tenantId = useSessionStore((s) => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const [actions, setActions] = useState<AutopilotAction[]>([]);
  const [runs, setRuns] = useState<AutopilotRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [actionList, runList] = await Promise.all([listAutopilotActions(tenantId), listAutopilotRuns(tenantId)]);
      setActions(actionList);
      setRuns(runList);
    } catch (err: any) {
      setError(err?.message || "Couldn't load Autopilot data.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleRunNow() {
    setRunning(true);
    setLastResult(null);
    try {
      const res = await runAutopilotNow(tenantId);
      setLastResult(res.summary);
      await refresh();
    } catch (err: any) {
      setError(err?.message || "Run failed.");
    } finally {
      setRunning(false);
    }
  }

  async function handleApprove(id: string) {
    setBusyId(id);
    try {
      await approveAutopilotAction(tenantId, id);
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(id: string) {
    setBusyId(id);
    try {
      await rejectAutopilotAction(tenantId, id);
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  const pending = actions.filter((a) => a.status === "pending");
  const resolved = actions.filter((a) => a.status !== "pending");
  const autoResolved = actions.filter((a) => a.status === "auto_executed").length;
  const lastRun = runs[0];

  return (
    <div className="p-6 max-w-5xl mx-auto" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </Link>

      {/* Hero header — aurora background + shiny gradient title */}
      <div className="relative overflow-hidden rounded-2xl mb-6 p-7 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
        <AuroraBackground />
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-extrabold flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <span className="text-shiny-gradient">Autopilot</span>
              <Sparkles className="w-6 h-6 text-indigo-400" />
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 max-w-md">
              Watches your accounts, campaigns, and payments — auto-resolves what's safe, queues the rest for you.
            </p>
            {lastRun && (
              <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Last run {new Date(lastRun.started_at).toLocaleString()}
              </p>
            )}
          </div>
          <button
            onClick={handleRunNow}
            disabled={running}
            className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-[length:200%_auto] hover:bg-[position:100%_0] shadow-lg shadow-indigo-500/25 disabled:opacity-50 transition-all duration-500"
          >
            <RefreshCw className={`w-4 h-4 ${running ? "animate-spin" : ""}`} /> {running ? "Running…" : "Run Now"}
          </button>
        </div>
        {lastResult && (
          <p className="relative mt-4 text-sm text-indigo-700 dark:text-indigo-300 animate-fade-in-up">{lastResult}</p>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {error} <button onClick={refresh} className="ml-2 underline font-medium">Retry</button>
        </div>
      ) : (
        <>
          {/* Stat cards with count-up animation + spotlight hover */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <SpotlightCard className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Pending Approval</p>
              <p className="text-3xl font-extrabold text-amber-500"><CountUp value={pending.length} /></p>
            </SpotlightCard>
            <SpotlightCard className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Auto-Resolved</p>
              <p className="text-3xl font-extrabold text-emerald-500"><CountUp value={autoResolved} /></p>
            </SpotlightCard>
            <SpotlightCard className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Total Runs</p>
              <p className="text-3xl font-extrabold text-indigo-500"><CountUp value={runs.length} /></p>
            </SpotlightCard>
          </div>

          {/* Pending approvals */}
          <section className="mb-8">
            <h2 className="font-semibold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-indigo-500" /> Needs Your Approval ({pending.length})
            </h2>
            {pending.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-400">
                Nothing waiting on you. 🎉
              </div>
            ) : (
              <div className="space-y-2">
                {pending.map((a, i) => (
                  <SpotlightCard
                    key={a.id}
                    className="animate-fade-in-up rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-4 flex items-start justify-between gap-3"
                  >
                    <div className="flex gap-3" style={{ animationDelay: `${i * 60}ms` }}>
                      <span className="text-lg leading-none mt-0.5">{CHECK_ICONS[a.check_name] || "🔔"}</span>
                      <div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{a.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{a.detail}</p>
                        <p className="text-[11px] text-slate-400 mt-1">{new Date(a.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => handleApprove(a.id)} disabled={busyId === a.id}
                        className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                        <Check className="w-3.5 h-3.5" /> Approve
                      </button>
                      <button onClick={() => handleReject(a.id)} disabled={busyId === a.id}
                        className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50">
                        <X className="w-3.5 h-3.5" /> Dismiss
                      </button>
                    </div>
                  </SpotlightCard>
                ))}
              </div>
            )}
          </section>

          {/* Auto-resolved / history */}
          <section>
            <h2 className="font-semibold text-slate-500 dark:text-slate-400 mb-3 text-sm">Recent Activity</h2>
            {resolved.length === 0 ? (
              <p className="text-sm text-slate-400">Nothing yet — run Autopilot to see activity here.</p>
            ) : (
              <div className="space-y-1.5">
                {resolved.slice(0, 20).map((a) => (
                  <div key={a.id} className="flex items-center gap-3 rounded-lg border border-slate-100 dark:border-slate-800 p-2.5 text-sm">
                    <span className="text-base leading-none">{CHECK_ICONS[a.check_name] || "🔔"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-700 dark:text-slate-300 truncate">{a.title}</p>
                    </div>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${
                      a.status === "auto_executed" ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300" :
                      a.status === "approved" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300" :
                      "bg-slate-100 text-slate-500 dark:bg-slate-800"
                    }`}>
                      {a.status === "auto_executed" ? "Auto-resolved" : a.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
