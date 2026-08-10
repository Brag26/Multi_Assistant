"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Mic, UserPlus, X, RefreshCw, Phone, BarChart2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { useSessionStore } from "@/store/session";
import { adminListAccounts, type AdminAccount } from "@/lib/api-billing";
import { refreshVapiAssistants, listAssets, type IntegrationAsset } from "@/lib/api";

interface AssistantHolder {
  assignment_id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: string | null;
  phone_number: string | null;
}
interface Assistant {
  external_id: string;
  label: string;
  first_message?: string | null;
  model?: string | null;
  assigned_to: AssistantHolder[];
}
interface PhoneUsage {
  phone_number: string;
  call_count: number;
  total_minutes: number;
}

export default function SuperadminAssistantsPage() {
  const tenantId = useSessionStore((s) => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<IntegrationAsset[]>([]);
  const [usage, setUsage] = useState<PhoneUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<Assistant | null>(null);
  const [pickedUser, setPickedUser] = useState("");
  const [pickedPhone, setPickedPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showUsage, setShowUsage] = useState(false);

  async function handleSync() {
    setSyncing(true);
    try {
      await refreshVapiAssistants(tenantId);
      await refresh();
    } finally {
      setSyncing(false);
    }
  }

  async function getToken() {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? "";
  }

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const [assistantsRes, accountList, numbers, usageRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/tenants/${tenantId}/assistants`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        adminListAccounts(),
        listAssets(tenantId, "twilio").catch(() => []),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/tenants/${tenantId}/assistants/phone-usage`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then((r) => (r.ok ? r.json() : [])),
      ]);
      if (!assistantsRes.ok) throw new Error("Failed to load assistants");
      setAssistants(await assistantsRes.json());
      setAccounts(accountList);
      setPhoneNumbers(numbers);
      setUsage(usageRes);
    } catch (err: any) {
      setError(err?.message || "Couldn't load assistants.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { refresh(); }, [refresh]);

  function openAssign(a: Assistant) {
    setAssigning(a);
    setPickedUser("");
    setPickedPhone("");
  }

  async function submitAssign() {
    if (!assigning || !pickedUser) return;
    setSaving(true);
    try {
      const token = await getToken();
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/tenants/${tenantId}/assistants/assign`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          assistant_external_id: assigning.external_id,
          assistant_label: assigning.label,
          assigned_to_user_id: pickedUser,
          phone_number: pickedPhone || null,
        }),
      });
      setAssigning(null);
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function revoke(assignmentId: string) {
    setSaving(true);
    try {
      const token = await getToken();
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/tenants/${tenantId}/assistants/assign/${assignmentId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Mic className="w-5 h-5 text-indigo-600" /> Manage Assistants
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Assign Vapi assistants (and optionally a phone number) to resellers or clients.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => setShowUsage((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50">
            <BarChart2 className="w-4 h-4" /> {showUsage ? "Hide" : "Phone"} Usage
          </button>
          <button onClick={handleSync} disabled={syncing}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} /> {syncing ? "Syncing…" : "Sync from Vapi"}
          </button>
        </div>
      </div>

      {showUsage && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5" /> Phone Number Usage
            </p>
          </div>
          {usage.length === 0 ? (
            <p className="text-sm text-slate-400 px-4 py-4">No calls placed from an assigned number yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                  <th className="px-4 py-2 font-medium">Phone Number</th>
                  <th className="px-4 py-2 font-medium">Calls</th>
                  <th className="px-4 py-2 font-medium">Minutes Used</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((u) => (
                  <tr key={u.phone_number} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{u.phone_number}</td>
                    <td className="px-4 py-2.5 text-slate-600">{u.call_count}</td>
                    <td className="px-4 py-2.5 text-slate-600">{u.total_minutes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {error} <button onClick={refresh} className="ml-2 underline font-medium">Retry</button>
        </div>
      ) : assistants.length === 0 ? (
        <p className="text-sm text-slate-400">
          No assistants synced yet — click "Sync from Vapi" above to pull them in.
        </p>
      ) : (
        <div className="space-y-3">
          {assistants.map((a) => (
            <div key={a.external_id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-800">{a.label}</p>
                  {a.model && <p className="text-xs text-slate-400">{a.model}</p>}
                  {a.first_message && <p className="text-xs text-slate-500 mt-1 line-clamp-1">"{a.first_message}"</p>}
                </div>
                <button onClick={() => openAssign(a)}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 shrink-0">
                  <UserPlus className="w-3.5 h-3.5" /> Assign
                </button>
              </div>
              {a.assigned_to.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {a.assigned_to.map((h) => (
                    <span key={h.assignment_id}
                      className="flex items-center gap-1.5 text-xs bg-slate-100 text-slate-600 rounded-full pl-2.5 pr-1 py-1">
                      {h.display_name || h.email} · {h.role === "tenant_admin" ? "Reseller" : "Client"}
                      {h.phone_number && (
                        <span className="flex items-center gap-0.5 text-indigo-600">
                          <Phone className="w-3 h-3" /> {h.phone_number}
                        </span>
                      )}
                      <button onClick={() => revoke(h.assignment_id)} disabled={saving}
                        className="hover:bg-slate-200 rounded-full p-0.5">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {assigning && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setAssigning(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-3">Assign "{assigning.label}"</h3>
            <label className="block text-xs text-slate-500 mb-1">Assign to</label>
            <select
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm mb-3"
              value={pickedUser}
              onChange={(e) => setPickedUser(e.target.value)}
            >
              <option value="">Select a reseller or client…</option>
              {accounts.map((acc) => (
                <option key={acc.user_id} value={acc.user_id}>
                  {(acc.display_name || acc.email)} — {acc.role === "tenant_admin" ? "Reseller" : "Client"}
                </option>
              ))}
            </select>
            <label className="block text-xs text-slate-500 mb-1">Phone number (optional — for usage tracking)</label>
            <select
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm mb-4"
              value={pickedPhone}
              onChange={(e) => setPickedPhone(e.target.value)}
            >
              <option value="">No specific number</option>
              {phoneNumbers.map((p) => (
                <option key={p.external_id} value={p.label}>{p.label}</option>
              ))}
            </select>
            {phoneNumbers.length === 0 && (
              <p className="text-xs text-slate-400 -mt-3 mb-4">
                No Twilio numbers synced — connect Twilio and sync numbers in Setup Wizard to track usage per number.
              </p>
            )}
            <div className="flex gap-2">
              <button onClick={submitAssign} disabled={!pickedUser || saving}
                className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50">
                Assign
              </button>
              <button onClick={() => setAssigning(null)}
                className="flex-1 py-2 rounded-lg text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
