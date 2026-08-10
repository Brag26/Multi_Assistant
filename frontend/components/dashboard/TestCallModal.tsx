"use client";

import { useEffect, useState } from "react";
import { PhoneCall, X } from "lucide-react";
import { listMyAssistants, testCall } from "@/lib/api";

interface Props {
  tenantId: string;
  open: boolean;
  onClose: () => void;
  onCalled?: () => void;
}

export function TestCallModal({ tenantId, open, onClose, onCalled }: Props) {
  const [assistants, setAssistants] = useState<{ external_id: string; label: string }[]>([]);
  const [assistantId, setAssistantId] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [calling, setCalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open || !tenantId) return;
    setLoading(true);
    setError(null);
    setSuccess(false);
    listMyAssistants(tenantId)
      .then((list) => {
        setAssistants(list);
        if (list.length === 1) setAssistantId(list[0].external_id);
      })
      .catch(() => setError("Couldn't load your assistants."))
      .finally(() => setLoading(false));
  }, [open, tenantId]);

  async function handleCall() {
    if (!assistantId || !phone) return;
    setCalling(true);
    setError(null);
    try {
      await testCall(tenantId, assistantId, phone);
      setSuccess(true);
      onCalled?.();
    } catch (err: any) {
      setError(err?.message || "Couldn't place the call.");
    } finally {
      setCalling(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}
        style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <PhoneCall className="w-4 h-4 text-indigo-600" /> Test Call
          </h3>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>

        {success ? (
          <div className="text-center py-4">
            <p className="text-sm font-medium text-emerald-700 mb-1">Call started!</p>
            <p className="text-xs text-slate-500 mb-4">Check Call Monitor to watch it live.</p>
            <button onClick={onClose} className="text-sm font-medium text-indigo-600">Close</button>
          </div>
        ) : (
          <>
            {loading ? (
              <p className="text-sm text-slate-500">Loading assistants…</p>
            ) : assistants.length === 0 ? (
              <p className="text-sm text-slate-400">
                No assistants available to you yet — ask your admin to assign one.
              </p>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Assistant</label>
                  <select
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                    value={assistantId}
                    onChange={(e) => setAssistantId(e.target.value)}
                  >
                    <option value="">Select an assistant…</option>
                    {assistants.map((a) => (
                      <option key={a.external_id} value={a.external_id}>{a.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Phone number</label>
                  <input
                    type="tel"
                    placeholder="+91XXXXXXXXXX"
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                {error && <p className="text-xs text-red-600">{error}</p>}
                <button
                  onClick={handleCall}
                  disabled={!assistantId || !phone || calling}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <PhoneCall className="w-4 h-4" /> {calling ? "Calling…" : "Call Now"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
