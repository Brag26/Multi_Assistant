"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSessionStore } from "@/store/session";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { Phone, Mic, Globe, RefreshCw, ExternalLink, Check, ChevronDown, ChevronUp, Zap, ArrowLeft } from "lucide-react";

type VapiAgent = {
  id: string;
  name: string;
  voice?: { provider?: string; voiceId?: string };
  model?: { provider?: string; model?: string };
  firstMessage?: string;
  createdAt: string;
};

type AssignedAgent = {
  agent_id: string;
  agent_name: string;
  assigned_to: string; // workflow or campaign id
  assigned_type: "workflow" | "campaign";
  assigned_name: string;
};

const ACCENT_MAP: Record<string, string> = {
  "en-US": "🇺🇸 US English",
  "en-GB": "🇬🇧 UK English",
  "en-AU": "🇦🇺 Australian",
  "en-IN": "🇮🇳 Indian English",
  "hi-IN": "🇮🇳 Hindi",
};

function SuperadminAgentsView() {
  const tenantId = useSessionStore(s => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const [agents, setAgents] = useState<VapiAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [vapiKey, setVapiKey] = useState<string | null>(null);

  async function getToken() {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? "";
  }

  async function fetchVapiKey() {
    const token = await getToken();
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/tenants/${tenantId}/integrations`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.ok) {
      const integrations = await res.json();
      const vapi = integrations.find((i: { provider: string; config: { api_key?: string } }) => i.provider === "vapi");
      if (vapi?.config?.api_key) setVapiKey(vapi.config.api_key);
    }
  }

  async function fetchAgents() {
    if (!vapiKey) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("https://api.vapi.ai/assistant", {
        headers: { Authorization: `Bearer ${vapiKey}` },
      });
      if (!res.ok) throw new Error("Failed to fetch agents from Vapi");
      const data = await res.json();
      setAgents(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchVapiKey();
  }, [tenantId]);

  useEffect(() => {
    if (vapiKey) fetchAgents();
    else setLoading(false);
  }, [vapiKey]);

  const getVoiceLabel = (agent: VapiAgent) => {
    if (!agent.voice) return "Default voice";
    return `${agent.voice.provider ?? ""} · ${agent.voice.voiceId ?? ""}`.trim();
  };

  const getModelLabel = (agent: VapiAgent) => {
    if (!agent.model) return "Default model";
    return `${agent.model.provider ?? ""} · ${agent.model.model ?? ""}`.trim();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </Link>


      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">AI Voice Agents</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage your Vapi agents — pulled live from your Vapi account</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchAgents} disabled={loading || !vapiKey}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <a href="https://app.vapi.ai" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white transition-all"
            style={{ background: "linear-gradient(135deg, #6366f1, #7c3aed)" }}>
            <ExternalLink className="w-4 h-4" /> Manage in Vapi
          </a>
        </div>
      </div>

      {/* No Vapi key */}
      {!vapiKey && !loading && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <Zap className="w-8 h-8 text-amber-500 mx-auto mb-3" />
          <h3 className="font-semibold text-amber-800 mb-1">Vapi not connected</h3>
          <p className="text-sm text-amber-600 mb-4">Connect your Vapi account in the Setup Wizard to manage your AI agents here.</p>
          <a href="/onboarding" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: "#f59e0b" }}>
            Go to Setup Wizard
          </a>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && vapiKey && (
        <div className="grid gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-100" />
                <div className="flex-1">
                  <div className="h-4 bg-slate-100 rounded w-48 mb-2" />
                  <div className="h-3 bg-slate-100 rounded w-32" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Agents list */}
      {!loading && vapiKey && agents.length === 0 && !error && (
        <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 text-center">
          <Mic className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <h3 className="font-medium text-slate-600 mb-1">No agents found</h3>
          <p className="text-sm text-slate-400 mb-4">Create your first AI agent in Vapi and it will appear here.</p>
          <a href="https://app.vapi.ai" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #6366f1, #7c3aed)" }}>
            Create agent in Vapi <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {!loading && agents.length > 0 && (
        <div className="space-y-3">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">Total Agents</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{agents.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">Voice Providers</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">
                {new Set(agents.map(a => a.voice?.provider).filter(Boolean)).size || "—"}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">LLM Models</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">
                {new Set(agents.map(a => a.model?.model).filter(Boolean)).size || "—"}
              </p>
            </div>
          </div>

          {agents.map(agent => (
            <div key={agent.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {/* Agent header */}
              <div className="flex items-center gap-4 p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => setExpanded(expanded === agent.id ? null : agent.id)}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "linear-gradient(135deg, #6366f115, #7c3aed15)", border: "1px solid #6366f130" }}>
                  <Mic className="w-5 h-5 text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-800 text-sm">{agent.name}</p>
                    <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Active</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Mic className="w-3 h-3" /> {getVoiceLabel(agent)}
                    </span>
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Zap className="w-3 h-3" /> {getModelLabel(agent)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a href={`https://app.vapi.ai/assistants/${agent.id}`} target="_blank" rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  {expanded === agent.id
                    ? <ChevronUp className="w-4 h-4 text-slate-400" />
                    : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>
              </div>

              {/* Expanded details */}
              {expanded === agent.id && (
                <div className="px-4 pb-4 border-t border-slate-100 pt-4 space-y-3">
                  {agent.firstMessage && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Opening Message</p>
                      <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600 italic">
                        &ldquo;{agent.firstMessage}&rdquo;
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Voice</p>
                      <div className="bg-slate-50 rounded-lg p-3">
                        <p className="text-xs font-medium text-slate-700">{agent.voice?.provider ?? "Default"}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{agent.voice?.voiceId ?? "—"}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Model</p>
                      <div className="bg-slate-50 rounded-lg p-3">
                        <p className="text-xs font-medium text-slate-700">{agent.model?.provider ?? "Default"}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{agent.model?.model ?? "—"}</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Agent ID</p>
                    <p className="text-xs font-mono bg-slate-50 rounded-lg px-3 py-2 text-slate-600 select-all">{agent.id}</p>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <a href={`https://app.vapi.ai/assistants/${agent.id}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white transition-all"
                      style={{ background: "linear-gradient(135deg, #6366f1, #7c3aed)" }}>
                      <ExternalLink className="w-3.5 h-3.5" /> Edit in Vapi
                    </a>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(agent.id);
                      }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                      Copy ID
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Reseller / Client view — only assistants assigned to them ──────────────

interface AssignedAssistant {
  external_id: string;
  label: string;
  assignment_id: string;
}

function FilteredAgentsView({ isReseller }: { isReseller: boolean }) {
  const tenantId = useSessionStore((s) => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const [assistants, setAssistants] = useState<AssignedAssistant[]>([]);
  const [clients, setClients] = useState<{ id: string; email: string; display_name: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<AssignedAssistant | null>(null);
  const [pickedClient, setPickedClient] = useState("");
  const [saving, setSaving] = useState(false);

  async function getToken() {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? "";
  }

  async function refresh() {
    if (!tenantId) return;
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/tenants/${tenantId}/assistants`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setAssistants(await res.json());

      if (isReseller) {
        const usersRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/users`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (usersRes.ok) {
          const all = await usersRes.json();
          setClients((Array.isArray(all) ? all : all.users || []).filter((u: any) => u.role === "agent"));
        }
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [tenantId]);

  async function submitAssign() {
    if (!assigning || !pickedClient) return;
    setSaving(true);
    try {
      const token = await getToken();
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/tenants/${tenantId}/assistants/assign`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          assistant_external_id: assigning.external_id,
          assistant_label: assigning.label,
          assigned_to_user_id: pickedClient,
        }),
      });
      setAssigning(null);
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Mic className="w-5 h-5 text-indigo-600" /> AI Voice Agents
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {isReseller ? "Assistants your admin has given you — assign them to your clients." : "Assistants available for your calls."}
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : assistants.length === 0 ? (
        <p className="text-sm text-slate-400">
          No assistants have been assigned to you yet — ask your admin to assign one.
        </p>
      ) : (
        <div className="space-y-2">
          {assistants.map((a) => (
            <div key={a.external_id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
              <p className="font-medium text-slate-800">{a.label}</p>
              {isReseller && (
                <button onClick={() => { setAssigning(a); setPickedClient(""); }}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100">
                  Assign to Client
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {assigning && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setAssigning(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-3">Assign "{assigning.label}" to client</h3>
            <select
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm mb-4"
              value={pickedClient}
              onChange={(e) => setPickedClient(e.target.value)}
            >
              <option value="">Select a client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.display_name || c.email}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button onClick={submitAssign} disabled={!pickedClient || saving}
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

// ── Role-aware entry point ──────────────────────────────────────────────────

export default function VapiAgentsPage() {
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token;
      if (!token) { setRole(""); return; }
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/approvals/me/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setRole(res.ok ? (await res.json()).role ?? "" : "");
      } catch {
        setRole("");
      }
    });
  }, []);

  if (role === null) return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  if (role === "super_admin") return <SuperadminAgentsView />;
  return <FilteredAgentsView isReseller={role === "tenant_admin"} />;
}
