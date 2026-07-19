"use client";

import { useSessionStore } from "@/store/session";
import { connectIntegration } from "@/lib/api";
import { getCalendarOAuthUrl } from "@/lib/api-features";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import {
  Check, Calendar, Zap, ArrowRight, ArrowLeft, ExternalLink, ChevronDown, ChevronUp,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Field = { key: string; label: string; placeholder: string; type: string; hint: string };
type Provider = {
  id: string;
  name: string;
  tag?: string;
  recommended?: boolean;
  desc: string;
  logo?: string;
  docsUrl: string;
  fields: Field[];
  oauthFlow?: boolean;
};
type Category = { label: string; emoji: string; color: string; providers: Provider[] };

// ─── Integration catalogue ────────────────────────────────────────────────────

const INTEGRATIONS: Record<string, Category> = {
  voiceai: {
    label: "Voice AI", emoji: "🤖", color: "#6366f1",
    providers: [
      { id: "vapi", name: "Vapi", tag: "Most Popular", recommended: true, desc: "Best-in-class AI voice agent platform. Powers most production voice AI workflows.", logo: "https://app.vapi.ai/favicon.ico", docsUrl: "https://app.vapi.ai", fields: [{ key: "api_key", label: "API Key", placeholder: "vapi_...", type: "password", hint: "app.vapi.ai → Account → API Keys" }] },
      { id: "retell", name: "Retell AI", tag: "Alternative", desc: "Developer-friendly AI voice platform with low-latency calls and custom LLM support.", docsUrl: "https://app.retellai.com", fields: [{ key: "api_key", label: "API Key", placeholder: "key_...", type: "password", hint: "app.retellai.com → API Keys" }] },
      { id: "bland", name: "Bland AI", tag: "Budget Option", desc: "Affordable AI calling platform. Great for high-volume outbound campaigns.", docsUrl: "https://app.bland.ai", fields: [{ key: "api_key", label: "API Key", placeholder: "sk-...", type: "password", hint: "app.bland.ai → Settings → API Key" }] },
    ],
  },
  telephony: {
    label: "Telephony", emoji: "📞", color: "#0ea5e9",
    providers: [
      { id: "twilio", name: "Twilio", tag: "Global Leader", recommended: true, desc: "World's most popular CPaaS. Best for global reach and developer flexibility.", docsUrl: "https://console.twilio.com", fields: [{ key: "account_sid", label: "Account SID", placeholder: "ACxxxxxxxx", type: "text", hint: "console.twilio.com → Account Info" }, { key: "auth_token", label: "Auth Token", placeholder: "••••••••", type: "password", hint: "console.twilio.com → Account Info" }, { key: "phone_number", label: "Phone Number", placeholder: "+15550001234", type: "text", hint: "Twilio phone number in E.164 format" }] },
      { id: "exotel", name: "Exotel", tag: "Best for India 🇮🇳", recommended: true, desc: "India's #1 cloud telephony. Powers Ola, Swiggy, Flipkart. 70M+ daily calls. INR pricing.", docsUrl: "https://my.exotel.com", fields: [{ key: "api_key", label: "API Key", placeholder: "exotel_key_...", type: "password", hint: "my.exotel.com → Settings → API" }, { key: "api_token", label: "API Token", placeholder: "exotel_token_...", type: "password", hint: "my.exotel.com → Settings → API" }, { key: "account_sid", label: "Account SID / Subdomain", placeholder: "mycompany", type: "text", hint: "Your Exotel subdomain" }, { key: "phone_number", label: "Exotel Number", placeholder: "+91XXXXXXXXXX", type: "text", hint: "Your Exotel virtual number" }] },
      { id: "msg91", name: "MSG91", tag: "India SMS & Voice 🇮🇳", desc: "2.5B+ monthly API calls. Used by Razorpay, PolicyBazaar. Full DLT compliance built-in.", docsUrl: "https://msg91.com", fields: [{ key: "auth_key", label: "Auth Key", placeholder: "xxxxxxxx", type: "password", hint: "msg91.com → API → Auth Key" }, { key: "sender_id", label: "Sender ID", placeholder: "VOIOPS", type: "text", hint: "Your DLT registered Sender ID" }] },
      { id: "plivo", name: "Plivo", tag: "30-46% Cheaper", desc: "India-founded, global reach. 30–46% cheaper than Twilio. 190+ countries, 1600+ carriers.", docsUrl: "https://console.plivo.com", fields: [{ key: "auth_id", label: "Auth ID", placeholder: "MAXXXXXXXXXXXXXXXX", type: "text", hint: "console.plivo.com → Overview" }, { key: "auth_token", label: "Auth Token", placeholder: "••••••••", type: "password", hint: "console.plivo.com → Overview" }, { key: "phone_number", label: "Phone Number", placeholder: "+919XXXXXXXXX", type: "text", hint: "Your Plivo number" }] },
      { id: "gupshup", name: "Gupshup", tag: "WhatsApp + Voice 🇮🇳", desc: "India's leading WhatsApp Business API provider. Also supports voice. Enterprise-grade.", docsUrl: "https://www.gupshup.io", fields: [{ key: "api_key", label: "API Key", placeholder: "gs_...", type: "password", hint: "gupshup.io → Dashboard → API Key" }, { key: "app_name", label: "App Name", placeholder: "my-voiceops-app", type: "text", hint: "Your Gupshup app name" }] },
      { id: "knowlarity", name: "Knowlarity", tag: "India Enterprise 🇮🇳", desc: "Cloud telephony for Indian enterprises. IVR, virtual numbers, call routing.", docsUrl: "https://www.knowlarity.com", fields: [{ key: "api_key", label: "API Key", placeholder: "kn_...", type: "password", hint: "knowlarity.com → API Credentials" }, { key: "caller_id", label: "Caller ID / Number", placeholder: "+91XXXXXXXXXX", type: "text", hint: "Your Knowlarity virtual number" }] },
      { id: "telnyx", name: "Telnyx", tag: "Developer Friendly", desc: "Global CPaaS with competitive rates. Great WebRTC and SIP trunking support.", docsUrl: "https://portal.telnyx.com", fields: [{ key: "api_key", label: "API Key", placeholder: "KEY...", type: "password", hint: "portal.telnyx.com → API Keys" }, { key: "phone_number", label: "Phone Number", placeholder: "+15550001234", type: "text", hint: "Your Telnyx phone number" }] },
      { id: "frejun", name: "FreJun", tag: "AI Voice India 🇮🇳", desc: "Sub-250ms WebSocket streaming. Best for AI voice in India & UAE. Vapi/Retell compatible.", docsUrl: "https://frejun.com", fields: [{ key: "api_key", label: "API Key", placeholder: "fj_...", type: "password", hint: "frejun.com → Settings → API" }, { key: "phone_number", label: "Phone Number", placeholder: "+91XXXXXXXXXX", type: "text", hint: "Your FreJun number" }] },
    ],
  },
  automation: {
    label: "Automation", emoji: "⚡", color: "#f59e0b",
    providers: [
      { id: "make", name: "Make.com", tag: "Most Popular", recommended: true, desc: "Visual automation platform. Connect 1000+ apps without coding.", docsUrl: "https://make.com", fields: [{ key: "webhook_url", label: "Webhook URL", placeholder: "https://hook.make.com/...", type: "text", hint: "make.com → Scenario → Webhooks → Copy URL" }] },
      { id: "zapier", name: "Zapier", tag: "Easiest Setup", desc: "The world's most popular automation tool. 5000+ app integrations.", docsUrl: "https://zapier.com", fields: [{ key: "webhook_url", label: "Webhook URL", placeholder: "https://hooks.zapier.com/...", type: "text", hint: "zapier.com → Zaps → Webhook → Copy URL" }] },
      { id: "n8n", name: "n8n", tag: "Open Source", desc: "Self-hostable automation. No per-task pricing. Full control over your data.", docsUrl: "https://n8n.io", fields: [{ key: "webhook_url", label: "Webhook URL", placeholder: "https://your-n8n.com/webhook/...", type: "text", hint: "n8n → Webhook node → Copy URL" }] },
    ],
  },
  crm: {
    label: "CRM", emoji: "👥", color: "#10b981",
    providers: [
      { id: "hubspot", name: "HubSpot", tag: "Most Popular", desc: "World's #1 CRM. Sync contacts, deals, and call outcomes automatically.", docsUrl: "https://app.hubspot.com", fields: [{ key: "api_key", label: "Private App Token", placeholder: "pat-na1-...", type: "password", hint: "HubSpot → Settings → Integrations → Private Apps" }] },
      { id: "zoho", name: "Zoho CRM", tag: "Popular in India 🇮🇳", desc: "India's favourite CRM. Great pricing, deep customization, strong India support.", docsUrl: "https://crm.zoho.in", fields: [{ key: "client_id", label: "Client ID", placeholder: "1000.XXXXX", type: "text", hint: "Zoho API Console → Client ID" }, { key: "client_secret", label: "Client Secret", placeholder: "••••••••", type: "password", hint: "Zoho API Console → Client Secret" }, { key: "refresh_token", label: "Refresh Token", placeholder: "1000.XXXXX", type: "password", hint: "OAuth → Refresh Token" }] },
    ],
  },
  notifications: {
    label: "Notifications", emoji: "🔔", color: "#8b5cf6",
    providers: [
      { id: "slack", name: "Slack", tag: "Most Popular", recommended: true, desc: "Real-time alerts for calls, leads, and appointments in your Slack workspace.", docsUrl: "https://api.slack.com/apps", fields: [{ key: "webhook_url", label: "Webhook URL", placeholder: "https://hooks.slack.com/services/...", type: "text", hint: "api.slack.com → Your App → Incoming Webhooks" }, { key: "channel", label: "Channel (optional)", placeholder: "#voice-ops", type: "text", hint: "Default Slack channel for alerts" }] },
      { id: "whatsapp", name: "WhatsApp Business", tag: "India Preferred 🇮🇳", desc: "Send call summaries and lead alerts directly to WhatsApp. Widely used in India.", docsUrl: "https://business.whatsapp.com", fields: [{ key: "api_key", label: "API Token", placeholder: "EAAxxxxxxx", type: "password", hint: "Meta Business → WhatsApp → API Token" }, { key: "phone_number_id", label: "Phone Number ID", placeholder: "1234567890", type: "text", hint: "Meta Business → WhatsApp → Phone Number ID" }] },
    ],
  },
  calendar: {
    label: "Calendar", emoji: "📅", color: "#ec4899",
    providers: [
      { id: "google_calendar", name: "Google Calendar", tag: "Most Popular", recommended: true, desc: "Automatically sync booked appointments from voice calls to your Google Calendar.", docsUrl: "https://calendar.google.com", fields: [], oauthFlow: true },
      { id: "calendly", name: "Calendly", tag: "Booking Flow", desc: "Let callers book meetings directly. Sync Calendly events back to Volant.", docsUrl: "https://calendly.com", fields: [{ key: "api_key", label: "Personal Access Token", placeholder: "eyJhbGci...", type: "password", hint: "calendly.com → Integrations → API & Webhooks" }] },
    ],
  },
};

type FieldValues = Record<string, string>;
type ConnectedMap = Record<string, boolean>;

export default function OnboardingPage() {
  const router = useRouter();
  const tenantId = useSessionStore(s => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const [connected, setConnected] = useState<ConnectedMap>({});
  const [rawIntegrations, setRawIntegrations] = useState<{ id: string; provider: string; name: string; owner_user_id: string | null; connected_at: string | null }[]>([]);
  const [deletingProfile, setDeletingProfile] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>("vapi");
  const [saving, setSaving] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, FieldValues>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeCategory, setActiveCategory] = useState<string>("voiceai");
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [profileName, setProfileName] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [accounts, setAccounts] = useState<{ user_id: string; display_name: string | null; email: string; role: string }[]>([]);

  // This wizard configures shared telephony/AI-vendor credentials for the whole
  // platform — only superadmin should reach it. Clients/resellers just use
  // whatever setup they're assigned; they don't configure it themselves.
  useEffect(() => {
    import("@/lib/supabase").then(({ createSupabaseBrowserClient }) => {
      const supabase = createSupabaseBrowserClient();
      supabase.auth.getSession().then(async ({ data }: any) => {
        const token = data.session?.access_token;
        if (!token) { setRole(""); return; }
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/approvals/me/status`, { headers: { Authorization: `Bearer ${token}` } });
          setRole(res.ok ? (await res.json()).role ?? "" : "");
        } catch { setRole(""); }
      });
    });
  }, []);

  useEffect(() => {
    if (role !== "super_admin") return;
    import("@/lib/api-billing").then(({ adminListAccounts }) => {
      adminListAccounts().then(setAccounts).catch(() => {});
    });
  }, [role]);

// Load saved integrations on mount
function loadIntegrations() {
  if (!tenantId) return;
  import("@/lib/api").then(({ listIntegrations }) => {
    listIntegrations(tenantId)
      .then(integrations => {
        const map: ConnectedMap = {};
        integrations.forEach((i: { provider: string }) => {
          map[i.provider] = true;
        });
        setConnected(map);
        setRawIntegrations(integrations as any);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  });
}
useEffect(() => { loadIntegrations(); }, [tenantId]);

// Group raw integration rows into named setup profiles for the Saved Setups panel
const profiles = (() => {
  const groups: Record<string, { name: string; owner_user_id: string | null; providers: string[]; connected_at: string | null }> = {};
  for (const row of rawIntegrations) {
    const key = `${row.name}::${row.owner_user_id ?? ""}`;
    if (!groups[key]) groups[key] = { name: row.name, owner_user_id: row.owner_user_id, providers: [], connected_at: row.connected_at };
    groups[key].providers.push(row.provider);
  }
  return Object.values(groups);
})();

function ownerLabel(ownerUserId: string | null): string {
  if (!ownerUserId) return "Shared / platform-wide";
  const acct = accounts.find((a) => a.user_id === ownerUserId);
  if (!acct) return "Assigned";
  return (acct.role === "tenant_admin" ? "Reseller: " : "Client: ") + (acct.display_name || acct.email);
}

function editProfile(p: { name: string; owner_user_id: string | null }) {
  setProfileName(p.name);
  setOwnerUserId(p.owner_user_id ?? "");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteProfile(p: { name: string; owner_user_id: string | null }) {
  const key = `${p.name}::${p.owner_user_id ?? ""}`;
  setDeletingProfile(key);
  try {
    const { createSupabaseBrowserClient } = await import("@/lib/supabase");
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const qs = p.owner_user_id ? `?owner_user_id=${encodeURIComponent(p.owner_user_id)}` : "";
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/tenants/${tenantId}/integrations/profiles/${encodeURIComponent(p.name)}${qs}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    loadIntegrations();
  } finally {
    setDeletingProfile(null);
  }
}
  
  function getFields(providerId: string): FieldValues { return fieldValues[providerId] ?? {}; }
  function setField(providerId: string, key: string, value: string) {
    setFieldValues(prev => ({ ...prev, [providerId]: { ...(prev[providerId] ?? {}), [key]: value } }));
  }

  async function handleConnect(categoryId: string, provider: Provider) {
    setSaving(provider.id);
    setErrors(prev => ({ ...prev, [provider.id]: "" }));
    try {
      const fields = getFields(provider.id);
      if (provider.oauthFlow) {
        const redirectUri = `${window.location.origin}/integrations/calendar/callback`;
        const res = await getCalendarOAuthUrl(tenantId, redirectUri);
        window.location.href = res.url;
        return;
      }
      let payload: Record<string, unknown> = { ...fields, name: profileName || undefined, owner_user_id: ownerUserId || undefined };
      if (provider.id === "slack") {
        const { configureSlack } = await import("@/lib/api-features");
        await configureSlack(tenantId, { webhook_url: fields.webhook_url, channel: fields.channel });
      } else if (provider.id === "twilio") {
        payload = { account_sid: fields.account_sid, auth_token: fields.auth_token, config: { phone: fields.phone_number }, name: profileName || undefined, owner_user_id: ownerUserId || undefined };
        await connectIntegration(tenantId, "twilio", payload);
      } else {
        await connectIntegration(tenantId, provider.id, payload);
      }
      setConnected(prev => ({ ...prev, [provider.id]: true }));
      loadIntegrations();
      setExpanded(null);
    } catch (e: unknown) {
      setErrors(prev => ({ ...prev, [provider.id]: e instanceof Error ? e.message : "Connection failed" }));
    } finally {
      setSaving(null);
    }
  }

  const categories = Object.entries(INTEGRATIONS);
  const totalConnected = Object.values(connected).filter(Boolean).length;

  if (role === null) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">Loading…</div>;
  }
  if (role !== "super_admin") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold text-slate-800 mb-2">Setup is managed by your admin</h1>
          <p className="text-sm text-slate-500 mb-4">Voice/telephony setup is configured by your administrator and assigned to your account — you don't need to set anything up here.</p>
          <button onClick={() => router.push("/dashboard")} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">Back to Dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="max-w-4xl mx-auto px-4 py-8">

        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/dashboard")} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Dashboard
            </button>
            <span className="text-slate-300">/</span>
            <span className="text-sm font-medium text-slate-700">Setup Wizard</span>
          </div>
          {totalConnected > 0 && (
            <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
              <Check className="w-3.5 h-3.5" />{totalConnected} connected
            </div>
          )}
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Connect your tools</h1>
          <p className="mt-1 text-slate-500">Set up your integrations to power your AI voice operations platform.</p>
        </div>

        <div className="mb-8 p-4 bg-white border border-slate-200 rounded-xl grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Profile / Setup Name</label>
            <input value={profileName} onChange={(e) => setProfileName(e.target.value)}
              placeholder="e.g. Real Estate Cold Calling Setup"
              className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
            <p className="mt-1 text-[11px] text-slate-400">Every connection below is saved under this name so you can tell setups apart.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Assign to Client / Reseller (optional)</label>
            <select value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value)}
              className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">Shared / not assigned</option>
              {accounts.map((a) => (
                <option key={a.user_id} value={a.user_id}>
                  {(a.role === "tenant_admin" ? "Reseller: " : "Client: ") + (a.display_name || a.email)}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-400">Leave unassigned for a shared, platform-wide setup.</p>
          </div>
        </div>

        {profiles.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Saved Setups ({profiles.length})</h2>
              <button onClick={() => { setProfileName(""); setOwnerUserId(""); }}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
                + New Setup
              </button>
            </div>
            <div className="space-y-2">
              {profiles.map((p) => {
                const key = `${p.name}::${p.owner_user_id ?? ""}`;
                const isCurrent = profileName === p.name && ownerUserId === (p.owner_user_id ?? "");
                return (
                  <div key={key}
                    className={`flex items-center justify-between p-3 rounded-lg border bg-white ${isCurrent ? "border-indigo-400 ring-1 ring-indigo-200" : "border-slate-200"}`}>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{p.name}</p>
                      <p className="text-xs text-slate-400">{ownerLabel(p.owner_user_id)} · {p.providers.join(", ")}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => editProfile(p)}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100">
                        Edit
                      </button>
                      <button onClick={() => { if (window.confirm(`Delete "${p.name}"? This removes all its connections (${p.providers.join(", ")}).`)) deleteProfile(p); }}
                        disabled={deletingProfile === key}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50">
                        {deletingProfile === key ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              To create a new setup, clear the Profile Name above and enter a new one — Setup 1, Setup 2, Setup 3, however many you need.
            </p>
          </div>
        )}

        <div className="flex gap-2 mb-6 flex-wrap">
          {categories.map(([catId, cat]) => {
            const catConnected = cat.providers.filter(p => connected[p.id]).length;
            return (
              <button key={catId} onClick={() => setActiveCategory(catId)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${activeCategory === catId ? "text-white shadow-sm" : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"}`}
                style={activeCategory === catId ? { background: cat.color } : {}}>
                <span>{cat.emoji}</span>{cat.label}
                {catConnected > 0 && <span className={`text-xs rounded-full px-1.5 ${activeCategory === catId ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-700"}`}>{catConnected}</span>}
              </button>
            );
          })}
        </div>

        {categories.filter(([catId]) => catId === activeCategory).map(([catId, cat]) => (
          <div key={catId} className="space-y-3">
            {cat.providers.map((provider: Provider) => {
              const isConnected = connected[provider.id];
              const isExpanded = expanded === provider.id;
              const isSaving = saving === provider.id;
              const fields = getFields(provider.id);
              const hasError = errors[provider.id];

              return (
                <div key={provider.id} className={`bg-white rounded-xl border transition-all ${isConnected ? "border-emerald-200 bg-emerald-50/30" : isExpanded ? "border-indigo-300 shadow-sm" : "border-slate-200 hover:border-slate-300"}`}>
                  <div className="flex items-center gap-4 p-4 cursor-pointer" onClick={() => !isConnected && setExpanded(isExpanded ? null : provider.id)}>
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0" style={{ background: `${cat.color}15`, border: `1px solid ${cat.color}30` }}>{cat.emoji}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-800 text-sm">{provider.name}</span>
                        {provider.tag && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: provider.recommended ? `${cat.color}15` : "#f1f5f9", color: provider.recommended ? cat.color : "#64748b" }}>
                            {provider.tag}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{provider.desc}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isConnected ? (
                        <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-100 rounded-full px-2.5 py-1"><Check className="w-3.5 h-3.5" /> Connected</div>
                      ) : (
                        <>
                          <a href={provider.docsUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"><ExternalLink className="w-3.5 h-3.5" /></a>
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </>
                      )}
                    </div>
                  </div>

                  {isExpanded && !isConnected && (
                    <div className="px-4 pb-4 border-t border-slate-100 pt-4">
                      {provider.oauthFlow ? (
                        <div className="space-y-3">
                          <p className="text-sm text-slate-500">Click below to authorize via Google OAuth. You&apos;ll be redirected back automatically.</p>
                          <button onClick={() => handleConnect(catId, provider)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all" style={{ background: cat.color }}>
                            <Calendar className="w-4 h-4" /> Connect Google Calendar
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {provider.fields.map(field => (
                            <div key={field.key}>
                              <label className="block text-xs font-semibold text-slate-600 mb-1">{field.label}</label>
                              <input type={field.type} placeholder={field.placeholder} value={fields[field.key] ?? ""} onChange={e => setField(provider.id, field.key, e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all bg-slate-50" />
                              {field.hint && <p className="text-xs text-slate-400 mt-1">📍 {field.hint}</p>}
                            </div>
                          ))}
                          {hasError && <div className="rounded-lg px-3 py-2 text-sm text-red-700 bg-red-50 border border-red-100">{hasError}</div>}
                          <div className="flex items-center gap-2 pt-1">
                            <button onClick={() => handleConnect(catId, provider)} disabled={isSaving || provider.fields.some(f => !fields[f.key])} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50" style={{ background: cat.color }}>
                              {isSaving ? "Connecting..." : `Connect ${provider.name}`}
                              {!isSaving && <ArrowRight className="w-3.5 h-3.5" />}
                            </button>
                            <button onClick={() => { setConnected(prev => ({ ...prev, [provider.id]: true })); setExpanded(null); }} className="px-3 py-2 rounded-lg text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors">Skip for now</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        <div className="mt-8 flex items-center justify-between pt-4 border-t border-slate-200">
          <p className="text-sm text-slate-500">
            {totalConnected === 0 ? "Connect at least one Voice AI and one Telephony provider to get started" : `${totalConnected} integration${totalConnected > 1 ? "s" : ""} connected — you're ready to build!`}
          </p>
          <button onClick={() => router.push("/dashboard")} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all" style={{ background: "linear-gradient(135deg, #6366f1, #7c3aed)" }}>
            Go to Dashboard <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
