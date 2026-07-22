"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, LifeBuoy, Check, Mail } from "lucide-react";
import { useSessionStore } from "@/store/session";
import {
  getSupportConfig, setSupportConfig, listSupportEscalations, resolveSupportEscalation,
  listMyAssistants, type SupportEscalation,
} from "@/lib/api";

export default function SupportAdminPage() {
  const tenantId = useSessionStore((s) => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const [assistants, setAssistants] = useState<{ external_id: string; label: string }[]>([]);
  const [selectedAssistant, setSelectedAssistant] = useState("");
  const [escalations, setEscalations] = useState<SupportEscalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [config, assistantList, escalationList] = await Promise.all([
        getSupportConfig(tenantId),
        listMyAssistants(tenantId),
        listSupportEscalations(tenantId),
      ]);
      setSelectedAssistant(config.support_assistant_id || "");
      setAssistants(assistantList);
      setEscalations(escalationList);
    } catch (err: any) {
      setError(err?.message || "Couldn't load support settings.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function save() {
    setSaving(true);
    try {
      await setSupportConfig(tenantId, selectedAssistant || null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function resolve(id: string) {
    await resolveSupportEscalation(tenantId, id);
    await refresh();
  }

  const openEscalations = escalations.filter((e) => e.status === "open");
  const resolvedEscalations = escalations.filter((e) => e.status !== "open");

  return (
    <div className="p-6 max-w-4xl mx-auto" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <LifeBuoy className="w-5 h-5 text-indigo-600" /> Support Chatbot
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Pick a Vapi assistant to power the support chat widget everyone sees. When someone asks for a human, it lands here.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {error} <button onClick={refresh} className="ml-2 underline font-medium">Retry</button>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-5 mb-6">
            <label className="block text-xs text-slate-500 mb-1">Support Assistant</label>
            {assistants.length === 0 ? (
              <p className="text-sm text-slate-400">
                No assistants assigned to you yet — assign one to yourself from Manage Assistants first.
              </p>
            ) : (
              <div className="flex gap-2">
                <select
                  className="flex-1 border border-slate-200 rounded-md px-3 py-2 text-sm"
                  value={selectedAssistant}
                  onChange={(e) => setSelectedAssistant(e.target.value)}
                >
                  <option value="">None — widget hidden</option>
                  {assistants.map((a) => <option key={a.external_id} value={a.external_id}>{a.label}</option>)}
                </select>
                <button onClick={save} disabled={saving}
                  className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 shrink-0">
                  {saved ? <><Check className="w-4 h-4" /> Saved</> : saving ? "Saving…" : "Save"}
                </button>
              </div>
            )}
            <p className="text-xs text-slate-400 mt-2">
              Also set <code>MAKE_SUPPORT_ESCALATION_WEBHOOK</code> on the backend to get these emailed to you — otherwise they'll only show up here.
            </p>
          </div>

          <div className="mb-6">
            <h2 className="font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
              <Mail className="w-4 h-4" /> Open Escalations ({openEscalations.length})
            </h2>
            {openEscalations.length === 0 ? (
              <p className="text-sm text-slate-400">Nothing waiting on you right now.</p>
            ) : (
              <div className="space-y-2">
                {openEscalations.map((e) => (
                  <div key={e.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-slate-800">{e.message}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{e.user_email || "Unknown user"} · {new Date(e.created_at).toLocaleString()}</p>
                    </div>
                    <button onClick={() => resolve(e.id)}
                      className="text-xs font-medium px-2.5 py-1 rounded bg-white border border-slate-200 hover:bg-slate-50 shrink-0">
                      Mark Resolved
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {resolvedEscalations.length > 0 && (
            <div>
              <h2 className="font-semibold text-slate-500 mb-2 text-sm">Resolved</h2>
              <div className="space-y-1.5">
                {resolvedEscalations.map((e) => (
                  <div key={e.id} className="rounded-lg border border-slate-100 p-2.5 text-sm text-slate-400">
                    {e.message} — {e.user_email || "Unknown"}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
