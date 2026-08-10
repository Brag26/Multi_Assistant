"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, LifeBuoy, Check, Mail, Trash2, Reply } from "lucide-react";
import { useSessionStore } from "@/store/session";
import {
  getSupportConfig, setSupportConfig, listSupportEscalations, resolveSupportEscalation,
  deleteSupportEscalation, replyToSupportEscalation, listMyAssistants, type SupportEscalation,
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

  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replySaving, setReplySaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function startReply(id: string) {
    setReplyingId(id);
    setReplyText("");
  }

  async function submitReply(id: string) {
    if (!replyText.trim()) return;
    setReplySaving(true);
    try {
      await replyToSupportEscalation(tenantId, id, replyText.trim());
      setReplyingId(null);
      setReplyText("");
      await refresh();
    } finally {
      setReplySaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this escalation? This can't be undone.")) return;
    setDeletingId(id);
    try {
      await deleteSupportEscalation(tenantId, id);
      await refresh();
    } finally {
      setDeletingId(null);
    }
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
                  <div key={e.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-slate-800">{e.message}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{e.user_email || "Unknown user"} · {new Date(e.created_at).toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => startReply(e.id)}
                          className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded bg-white border border-slate-200 hover:bg-slate-50">
                          <Reply className="w-3 h-3" /> Reply
                        </button>
                        <button onClick={() => resolve(e.id)}
                          className="text-xs font-medium px-2.5 py-1 rounded bg-white border border-slate-200 hover:bg-slate-50">
                          Mark Resolved
                        </button>
                        <button onClick={() => handleDelete(e.id)} disabled={deletingId === e.id}
                          className="p-1.5 rounded bg-white border border-slate-200 hover:bg-red-50 text-red-500 disabled:opacity-50">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {e.reply && (
                      <div className="mt-2 pl-3 border-l-2 border-indigo-200">
                        <p className="text-xs text-slate-400">Your reply:</p>
                        <p className="text-sm text-slate-700">{e.reply}</p>
                      </div>
                    )}

                    {replyingId === e.id && (
                      <div className="mt-2 flex gap-2">
                        <input
                          autoFocus
                          value={replyText}
                          onChange={(ev) => setReplyText(ev.target.value)}
                          onKeyDown={(ev) => ev.key === "Enter" && submitReply(e.id)}
                          placeholder="Type your reply — they'll see it in their notifications…"
                          className="flex-1 text-sm px-3 py-1.5 rounded-md border border-slate-200"
                        />
                        <button onClick={() => submitReply(e.id)} disabled={replySaving || !replyText.trim()}
                          className="text-xs font-semibold px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                          {replySaving ? "Sending…" : "Send"}
                        </button>
                        <button onClick={() => setReplyingId(null)}
                          className="text-xs font-medium px-2.5 py-1.5 rounded-md text-slate-500 hover:bg-slate-100">
                          Cancel
                        </button>
                      </div>
                    )}
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
                  <div key={e.id} className="rounded-lg border border-slate-100 p-2.5 text-sm text-slate-400 flex items-start justify-between gap-3">
                    <div>
                      <p>{e.message} — {e.user_email || "Unknown"}</p>
                      {e.reply && <p className="text-xs text-slate-400 mt-1 pl-2 border-l-2 border-slate-200">Replied: {e.reply}</p>}
                    </div>
                    <button onClick={() => handleDelete(e.id)} disabled={deletingId === e.id}
                      className="p-1.5 rounded hover:bg-red-50 text-red-400 disabled:opacity-50 shrink-0">
                      <Trash2 className="w-3 h-3" />
                    </button>
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
