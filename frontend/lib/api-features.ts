// lib/api-features.ts — new feature API calls
// Import and re-export alongside existing api.ts

import { apiFetch } from "./api";

// ── DNC List ──────────────────────────────────────────────────────────────────

export interface DncEntry {
  id: string;
  phone: string;
  reason?: string;
  created_at: string;
}

export const listDnc = (tid: string) => apiFetch<DncEntry[]>(`/tenants/${tid}/dnc`);
export const addToDnc = (tid: string, phone: string, reason?: string) =>
  apiFetch<DncEntry>(`/tenants/${tid}/dnc`, { method: "POST", body: JSON.stringify({ phone, reason }) });
export const removeFromDnc = (tid: string, phone: string) =>
  apiFetch<void>(`/tenants/${tid}/dnc/${encodeURIComponent(phone)}`, { method: "DELETE" });
export const checkDnc = (tid: string, phone: string) =>
  apiFetch<{ phone: string; blocked: boolean }>(`/tenants/${tid}/dnc/check/${encodeURIComponent(phone)}`);

// ── Lead Scoring ──────────────────────────────────────────────────────────────

export interface LeadScore {
  id: string;
  name: string;
  phone: string;
  lead_status: string;
  lead_score: number;
  score_updated_at?: string;
}

export const listLeadScores = (tid: string, minScore = 0) =>
  apiFetch<LeadScore[]>(`/tenants/${tid}/leads/scores?min_score=${minScore}`);
export const rescoreContact = (tid: string, contactId: string) =>
  apiFetch<{ contact_id: string; lead_score: number }>(`/tenants/${tid}/leads/${contactId}/rescore`, { method: "POST" });

// ── CSV Import ────────────────────────────────────────────────────────────────

export interface ImportResult {
  created: number;
  duplicates: number;
  errors: string[];
}

export const importContactsCsv = (tid: string, file: File): Promise<ImportResult> => {
  const form = new FormData();
  form.append("file", file);
  return apiFetch(`/tenants/${tid}/contacts/import/csv`, { method: "POST", body: form });
};

// ── Campaign Reports ──────────────────────────────────────────────────────────

export interface CampaignReport {
  campaign_id: string;
  total_calls: number;
  connected_calls: number;
  connection_rate: number;
  qualified_leads: number;
  avg_duration_seconds: number;
  outcomes_breakdown: Record<string, number>;
  last_saved_report?: string;
}

export const getCampaignReport = (tid: string, cid: string) =>
  apiFetch<CampaignReport>(`/tenants/${tid}/campaigns/${cid}/report`);

export async function downloadCampaignCsv(tid: string, cid: string, filename?: string) {
  const { authHeaders } = await import("./api");
  const { Authorization } = await authHeaders();
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/tenants/${tid}/campaigns/${cid}/export/csv`, {
    headers: Authorization ? { Authorization } : {},
  });
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || `campaign_${cid}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Slack ─────────────────────────────────────────────────────────────────────

export interface SlackConfig {
  connected: boolean;
  channel?: string;
  events?: string[];
  enabled?: boolean;
}

export const getSlackConfig = (tid: string) => apiFetch<SlackConfig>(`/tenants/${tid}/integrations/slack`);
export const configureSlack = (tid: string, p: { webhook_url: string; channel?: string; events?: string[] }) =>
  apiFetch<SlackConfig>(`/tenants/${tid}/integrations/slack`, { method: "POST", body: JSON.stringify(p) });
export const testSlack = (tid: string) => apiFetch(`/tenants/${tid}/integrations/slack/test`, { method: "POST" });
export const disconnectSlack = (tid: string) => apiFetch(`/tenants/${tid}/integrations/slack`, { method: "DELETE" });

// ── Calendar ──────────────────────────────────────────────────────────────────

export interface CalendarConfig {
  connected: boolean;
  provider?: string;
  calendar_id?: string;
  enabled?: boolean;
}

export const getCalendarConfig = (tid: string) => apiFetch<CalendarConfig>(`/tenants/${tid}/integrations/calendar`);
export const getCalendarOAuthUrl = (tid: string, redirectUri: string) =>
  apiFetch<{ url: string }>(`/tenants/${tid}/integrations/calendar/oauth/url?redirect_uri=${encodeURIComponent(redirectUri)}`);
export const disconnectCalendar = (tid: string) => apiFetch(`/tenants/${tid}/integrations/calendar`, { method: "DELETE" });

// ── Retry Queue ───────────────────────────────────────────────────────────────

export interface RetryQueueItem {
  id: string;
  phone: string;
  attempt: number;
  max_attempts: number;
  retry_after: string;
  status: string;
}

export const listRetryQueue = (tid: string) => apiFetch<RetryQueueItem[]>(`/tenants/${tid}/retry-queue`);
export const cancelRetry = (tid: string, itemId: string) =>
  apiFetch(`/tenants/${tid}/retry-queue/${itemId}/cancel`, { method: "POST" });
