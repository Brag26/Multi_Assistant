"use client";

import { useEffect, useState, useCallback } from "react";
import { Target, Play, RefreshCw, Download, Zap } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/store/session";
import {
  listApifyActors, runApifyActor, listLeadgenRuns, refreshLeadgenRun,
  importLeadgenRun, getLeadgenUsage, type LeadgenRun,
} from "@/lib/api";

export default function LeadGenPage() {
  const tenantId = useSessionStore((s) => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const [actors, setActors] = useState<{ id: string; name: string; title: string }[]>([]);
  const [runs, setRuns] = useState<LeadgenRun[]>([]);
  const [usage, setUsage] = useState<any>(null);
  const [selectedActor, setSelectedActor] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [busyRunId, setBusyRunId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [actorList, runList, usageData] = await Promise.all([
        listApifyActors(tenantId),
        listLeadgenRuns(tenantId),
        getLeadgenUsage(tenantId),
      ]);
      setActors(actorList);
      setRuns(runList);
      setUsage(usageData);
    } catch (err: any) {
      setError(err?.message || "Couldn't load lead generation data. Is Apify connected in the Setup Wizard?");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleRun() {
    if (!selectedActor) return;
    setRunning(true);
    try {
      await runApifyActor(tenantId, selectedActor);
      await refresh();
    } catch (err: any) {
      setError(err?.message || "Couldn't start the run.");
    } finally {
      setRunning(false);
    }
  }

  async function handleRefreshRun(runId: string) {
    setBusyRunId(runId);
    try {
      await refreshLeadgenRun(tenantId, runId);
      await refresh();
    } finally {
      setBusyRunId(null);
    }
  }

  async function handleImport(runId: string) {
    setBusyRunId(runId);
    try {
      await importLeadgenRun(tenantId, runId);
      await refresh();
    } finally {
      setBusyRunId(null);
    }
  }

  return (
    <DashboardShell>
      <div style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div className="mb-6">
          <p className="text-sm font-medium text-indigo-600">CRM</p>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Target className="w-5 h-5" /> Lead Generation
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Scrape leads with Apify, then import them straight into Contacts.</p>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : error ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {error} <button onClick={refresh} className="ml-2 underline font-medium">Retry</button>
          </div>
        ) : (
          <>
            {/* Usage summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {usage?.by_user ? (
                <Card className="md:col-span-3">
                  <CardHeader><h2 className="font-semibold text-slate-800 flex items-center gap-1.5"><Zap className="w-4 h-4" /> Usage by Account</h2></CardHeader>
                  <CardContent className="p-0">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                          <th className="px-4 py-2 font-medium">Account</th>
                          <th className="px-4 py-2 font-medium">Runs</th>
                          <th className="px-4 py-2 font-medium">Compute Units</th>
                          <th className="px-4 py-2 font-medium">Leads Imported</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usage.by_user.map((u: any) => (
                          <tr key={u.user_id} className="border-b border-slate-50 last:border-0">
                            <td className="px-4 py-2.5">{u.display_name || u.email}</td>
                            <td className="px-4 py-2.5">{u.run_count}</td>
                            <td className="px-4 py-2.5">{u.total_compute_units.toFixed(2)}</td>
                            <td className="px-4 py-2.5">{u.total_leads_imported}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              ) : usage ? (
                <>
                  <Card><CardContent className="pt-5"><p className="text-2xl font-bold text-slate-800">{usage.run_count}</p><p className="text-xs text-slate-500">Runs</p></CardContent></Card>
                  <Card><CardContent className="pt-5"><p className="text-2xl font-bold text-slate-800">{usage.total_compute_units?.toFixed(2)}</p><p className="text-xs text-slate-500">Compute Units</p></CardContent></Card>
                  <Card><CardContent className="pt-5"><p className="text-2xl font-bold text-slate-800">{usage.total_leads_imported}</p><p className="text-xs text-slate-500">Leads Imported</p></CardContent></Card>
                </>
              ) : null}
            </div>

            {/* Run a scraper */}
            <Card className="mb-6">
              <CardHeader><h2 className="font-semibold text-slate-800">Run a Scraper</h2></CardHeader>
              <CardContent>
                {actors.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    No Apify actors found — connect Apify (with a valid API token) from the Setup Wizard first.
                  </p>
                ) : (
                  <div className="flex gap-2">
                    <select
                      className="flex-1 border border-slate-200 rounded-md px-3 py-2 text-sm"
                      value={selectedActor}
                      onChange={(e) => setSelectedActor(e.target.value)}
                    >
                      <option value="">Select an actor…</option>
                      {actors.map((a) => <option key={a.id} value={a.id}>{a.title || a.name}</option>)}
                    </select>
                    <Button onClick={handleRun} disabled={!selectedActor || running} className="gap-1.5 shrink-0">
                      <Play className="w-4 h-4" /> {running ? "Starting…" : "Run"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Run history */}
            <Card>
              <CardHeader><h2 className="font-semibold text-slate-800">Recent Runs</h2></CardHeader>
              <CardContent className="p-0">
                {runs.length === 0 ? (
                  <p className="text-sm text-slate-400 px-4 py-4">No runs yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                        <th className="px-4 py-2 font-medium">Actor</th>
                        <th className="px-4 py-2 font-medium">Status</th>
                        <th className="px-4 py-2 font-medium">Items</th>
                        <th className="px-4 py-2 font-medium">Compute Units</th>
                        <th className="px-4 py-2 font-medium">Imported</th>
                        <th className="px-4 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map((r) => (
                        <tr key={r.id} className="border-b border-slate-50 last:border-0">
                          <td className="px-4 py-2.5 font-mono text-xs">{r.actor_id}</td>
                          <td className="px-4 py-2.5">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              r.status === "SUCCEEDED" ? "bg-emerald-100 text-emerald-700" :
                              r.status === "FAILED" || r.status === "ABORTED" ? "bg-red-100 text-red-700" :
                              "bg-amber-100 text-amber-700"
                            }`}>{r.status}</span>
                          </td>
                          <td className="px-4 py-2.5">{r.item_count}</td>
                          <td className="px-4 py-2.5">{r.compute_units.toFixed(2)}</td>
                          <td className="px-4 py-2.5">{r.imported_contact_count}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex gap-1 justify-end">
                              <button onClick={() => handleRefreshRun(r.id)} disabled={busyRunId === r.id}
                                className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Refresh status">
                                <RefreshCw className={`w-3.5 h-3.5 ${busyRunId === r.id ? "animate-spin" : ""}`} />
                              </button>
                              {r.status === "SUCCEEDED" && r.imported_contact_count === 0 && (
                                <button onClick={() => handleImport(r.id)} disabled={busyRunId === r.id}
                                  className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100">
                                  <Download className="w-3 h-3" /> Import to Contacts
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
