"use client";

import { useEffect, useState } from "react";
import { Megaphone, X, Search } from "lucide-react";
import { listMyAssistants, listContacts, createCampaign, campaignAction, getMySettings, type Contact } from "@/lib/api";
import { COMMON_TIMEZONES, detectBrowserTimezone, zonedDateTimeToUtcISOString } from "@/lib/timezones";

interface Props {
  tenantId: string;
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export function NewCampaignModal({ tenantId, open, onClose, onCreated }: Props) {
  const [assistants, setAssistants] = useState<{ external_id: string; label: string }[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [assistantId, setAssistantId] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [startMode, setStartMode] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [timezone, setTimezone] = useState(detectBrowserTimezone());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !tenantId) return;
    setError(null);
    listMyAssistants(tenantId).then(setAssistants).catch(() => {});
    listContacts(tenantId).then(setContacts).catch(() => {});
    getMySettings(tenantId).then((res) => { if (res.timezone) setTimezone(res.timezone); }).catch(() => {});
  }, [open, tenantId]);

  useEffect(() => {
    if (!open || !tenantId) return;
    const t = setTimeout(() => {
      listContacts(tenantId, search).then(setContacts).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [search, open, tenantId]);

  function toggleContact(id: string) {
    setSelectedContacts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleCreate() {
    if (!name || !assistantId || selectedContacts.size === 0) return;
    setSaving(true);
    setError(null);
    let campaign;
    try {
      campaign = await createCampaign(tenantId, {
        name,
        vapi_assistant_id: assistantId,
        contact_ids: Array.from(selectedContacts),
        scheduled_at: startMode === "later" && scheduledAt ? zonedDateTimeToUtcISOString(scheduledAt, timezone) : null,
      });
    } catch (err: any) {
      setError(err?.message || "Couldn't create the campaign.");
      setSaving(false);
      return;
    }

    // Campaign now exists regardless of what happens next — always refresh
    // the list and reset the form so the user sees it and isn't left with a
    // stale/confusing modal state.
    onCreated?.();
    setName(""); setAssistantId(""); setSelectedContacts(new Set()); setStartMode("now"); setScheduledAt("");

    if (startMode === "now") {
      try {
        await campaignAction(tenantId, campaign.id, "launch");
      } catch (err: any) {
        setSaving(false);
        setError((err?.message || "Campaign was created, but couldn't start dialing.") + " You can retry from the campaign list using the launch button.");
        return;
      }
    }
    setSaving(false);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}
        style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-indigo-600" /> New Campaign
          </h3>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Campaign name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q3 Follow-up Calls"
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Assistant</label>
            <select value={assistantId} onChange={(e) => setAssistantId(e.target.value)}
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm">
              <option value="">Select an assistant…</option>
              {assistants.map((a) => <option key={a.external_id} value={a.external_id}>{a.label}</option>)}
            </select>
            {assistants.length === 0 && <p className="text-xs text-slate-400 mt-1">No assistants available — ask your admin to assign one.</p>}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-slate-500">
                Contacts ({selectedContacts.size} selected)
              </label>
              <button
                onClick={() => {
                  if (selectedContacts.size === contacts.length) {
                    setSelectedContacts(new Set());
                  } else {
                    setSelectedContacts(new Set(contacts.map((c) => c.id)));
                  }
                }}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
              >
                {selectedContacts.size === contacts.length && contacts.length > 0 ? "Clear All" : "Select All"}
              </button>
            </div>
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contacts…"
                className="w-full border border-slate-200 rounded-md pl-8 pr-3 py-2 text-sm" />
            </div>
            <div className="border border-slate-200 rounded-md max-h-48 overflow-y-auto divide-y divide-slate-100">
              {contacts.length === 0 ? (
                <p className="text-xs text-slate-400 p-3">No contacts found.</p>
              ) : contacts.map((c) => (
                <label key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={selectedContacts.has(c.id)} onChange={() => toggleContact(c.id)} />
                  <span className="text-slate-700">{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.phone}</span>
                  <span className="text-xs text-slate-400 ml-auto">{c.phone}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Start</label>
            <div className="flex gap-2 mb-2">
              <button onClick={() => setStartMode("now")}
                className={`flex-1 py-2 rounded-lg text-sm font-medium ${startMode === "now" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                Start Now
              </button>
              <button onClick={() => setStartMode("later")}
                className={`flex-1 py-2 rounded-lg text-sm font-medium ${startMode === "later" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                Schedule
              </button>
            </div>
            {startMode === "later" && (
              <div className="grid grid-cols-2 gap-2">
                <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)}
                  className="border border-slate-200 rounded-md px-3 py-2 text-sm" />
                <select value={timezone} onChange={(e) => setTimezone(e.target.value)}
                  className="border border-slate-200 rounded-md px-2 py-2 text-xs">
                  {(COMMON_TIMEZONES.includes(timezone) ? COMMON_TIMEZONES : [timezone, ...COMMON_TIMEZONES]).map((tz) => (
                    <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            onClick={handleCreate}
            disabled={!name || !assistantId || selectedContacts.size === 0 || saving || (startMode === "later" && !scheduledAt)}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Creating…" : startMode === "now" ? "Create & Start Now" : "Create & Schedule"}
          </button>
        </div>
      </div>
    </div>
  );
}
