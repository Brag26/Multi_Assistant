"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Check } from "lucide-react";
import { useSessionStore } from "@/store/session";
import {
  getFeatureCatalog, listAccountsWithFeatures, setFeaturesBulk,
  type FeatureCatalogItem,
} from "@/lib/api";

interface Account {
  user_id: string;
  email: string;
  display_name: string | null;
  role: string;
  granted_features: string[];
}

export default function FeatureAccessPage() {
  const tenantId = useSessionStore((s) => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const [features, setFeatures] = useState<FeatureCatalogItem[]>([]);
  const [alwaysVisible, setAlwaysVisible] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedUser, setSelectedUser] = useState<Account | null>(null);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [catalog, accountList] = await Promise.all([
        getFeatureCatalog(tenantId),
        listAccountsWithFeatures(tenantId),
      ]);
      setFeatures(catalog.features);
      setAlwaysVisible(catalog.always_visible);
      setAccounts(accountList);
    } catch (err: any) {
      setError(err?.message || "Couldn't load feature access data.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { refresh(); }, [refresh]);

  function selectUser(acct: Account) {
    setSelectedUser(acct);
    setDraft(new Set(acct.granted_features));
    setSaved(false);
  }

  function toggle(key: string) {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    setSaved(false);
  }

  async function save() {
    if (!selectedUser) return;
    setSaving(true);
    try {
      await setFeaturesBulk(tenantId, selectedUser.user_id, Array.from(draft));
      setSaved(true);
      await refresh();
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  const grouped = features.reduce<Record<string, FeatureCatalogItem[]>>((acc, f) => {
    (acc[f.group] ??= []).push(f);
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-6xl mx-auto" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-indigo-600" /> Feature Access
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          By default, resellers and clients only see Dashboard, Calls, Campaigns, Contacts, Billing, and Settings.
          Grant access to anything else here, per account.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {error} <button onClick={refresh} className="ml-2 underline font-medium">Retry</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Account list */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Accounts</p>
            {accounts.length === 0 && <p className="text-sm text-slate-400">No resellers or clients yet.</p>}
            {accounts.map((acct) => (
              <button
                key={acct.user_id}
                onClick={() => selectUser(acct)}
                className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                  selectedUser?.user_id === acct.user_id
                    ? "border-indigo-400 bg-indigo-50"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <p className="font-medium text-slate-800">{acct.display_name || acct.email}</p>
                <p className="text-xs text-slate-400">
                  {acct.role === "tenant_admin" ? "Reseller" : "Client"} · {acct.granted_features.length} feature{acct.granted_features.length === 1 ? "" : "s"} granted
                </p>
              </button>
            ))}
          </div>

          {/* Permission editor */}
          <div className="md:col-span-2">
            {!selectedUser ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-400">
                Select an account on the left to edit their feature access.
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="font-semibold text-slate-800">{selectedUser.display_name || selectedUser.email}</p>
                    <p className="text-xs text-slate-400">{selectedUser.role === "tenant_admin" ? "Reseller" : "Client"}</p>
                  </div>
                  <button
                    onClick={save}
                    disabled={saving}
                    className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {saved ? <><Check className="w-4 h-4" /> Saved</> : saving ? "Saving…" : "Save Changes"}
                  </button>
                </div>

                <p className="text-xs text-slate-400 mb-4">
                  Always visible to every account, no grant needed: {alwaysVisible.join(", ")}
                </p>

                <div className="space-y-4">
                  {Object.entries(grouped).map(([groupName, items]) => (
                    <div key={groupName}>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{groupName}</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {items.map((f) => {
                          const isAlways = alwaysVisible.includes(f.key);
                          const checked = isAlways || draft.has(f.key);
                          return (
                            <label
                              key={f.key}
                              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm ${
                                isAlways ? "text-slate-400" : "text-slate-700 hover:bg-slate-50 cursor-pointer"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={isAlways}
                                onChange={() => toggle(f.key)}
                              />
                              {f.label}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
