// lib/api.ts — extended with workflow builder, monitoring, analytics, leads,
// appointments, notifications, and audit logs.

import { createSupabaseBrowserClient } from "@/lib/supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

// ─── Shared types ────────────────────────────────────────────────────────────

export type WorkflowStatus = "draft" | "active" | "paused" | "archived";
export type CallStatus = "queued" | "in_progress" | "completed" | "failed" | "canceled";
export type LeadStatus = "new" | "contacted" | "qualified" | "nurturing" | "converted" | "lost";
export type AppointmentStatus = "scheduled" | "completed" | "canceled";
export type NotificationType = "info" | "warning" | "error" | "success";
export type WorkflowTriggerType =
  | "campaign_started" | "campaign_completed"
  | "call_started" | "call_answered" | "call_completed" | "call_failed"
  | "lead_qualified" | "intent_detected" | "appointment_booked"
  | "incoming_make_webhook" | "cron";
export type WorkflowActionType =
  | "start_vapi_call" | "end_call" | "transfer_call"
  | "update_contact" | "change_lead_status" | "add_note"
  | "trigger_make_scenario" | "send_webhook" | "send_email_notification"
  | "delay" | "retry";
export type WorkflowLogicType =
  | "if_else" | "switch" | "wait" | "merge" | "parallel_execution" | "stop_workflow";

export interface WorkflowNodeData {
  label: string;
  category: "trigger" | "action" | "logic";
  trigger_type?: WorkflowTriggerType;
  cron_expression?: string;
  action_type?: WorkflowActionType;
  logic_type?: WorkflowLogicType;
  config?: Record<string, unknown>;
  description?: string;
}

export interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: WorkflowNodeData;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  source_handle?: string;
  target_handle?: string;
  label?: string;
  animated?: boolean;
}

export interface Workflow {
  id: string;
  tenant_id: string;
  name: string;
  description?: string | null;
  status: WorkflowStatus;
  vapi_assistant_id?: string | null;
  twilio_phone_number?: string | null;
  make_webhook_url?: string | null;
  trigger_type?: WorkflowTriggerType | null;
  cron_expression?: string | null;
  config: Record<string, unknown>;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  builder_version: number;
  created_at: string;
  updated_at: string;
}

export interface WorkflowVersion {
  id: string;
  workflow_id: string;
  version: number;
  config: Record<string, unknown>;
  created_at: string;
}

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  trigger_event: string;
  status: "running" | "completed" | "failed" | "paused";
  variables: Record<string, unknown>;
  error_message?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowRunStep {
  id: string;
  run_id: string;
  node_id: string;
  node_type: string;
  node_name: string;
  status: "completed" | "failed" | "skipped";
  input_data: Record<string, unknown>;
  output_data: Record<string, unknown>;
  error_message?: string | null;
  duration_ms?: number | null;
  created_at: string;
}

export interface Contact {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  phone: string;
  email?: string | null;
  company?: string | null;
  source?: string | null;
  lead_status: LeadStatus;
  created_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  description?: string | null;
  status: "draft" | "scheduled" | "running" | "paused" | "completed" | "canceled";
  vapi_assistant_id?: string | null;
  twilio_phone_number?: string | null;
  scheduled_at?: string | null;
}

export interface Integration {
  id: string;
  provider: "vapi" | "twilio" | "make";
  name: string;
  owner_user_id?: string | null;
  connected_at?: string | null;
  disconnected_at?: string | null;
}

export interface IntegrationAsset {
  id: string;
  provider: "vapi" | "twilio" | "make";
  external_id: string;
  label: string;
  synced_at: string;
}

export interface CallRecord {
  id: string;
  contact_id?: string | null;
  campaign_id?: string | null;
  workflow_id?: string | null;
  assistant_id?: string | null;
  customer_phone: string;
  status: CallStatus;
  outcome: string;
  duration_seconds?: number | null;
  recording_url?: string | null;
  summary?: string | null;
  structured_data?: Record<string, unknown> | null;
  success_evaluation?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  created_at: string;
}

export interface CallMonitoringEvent {
  id: string;
  call_id: string;
  event_type: "status_update" | "transcript_chunk" | "latency_ping" | "error";
  event_data: Record<string, unknown>;
  recorded_at: string;
}

export interface LeadActivity {
  id: string;
  contact_id: string;
  activity_type: "call" | "note" | "status_change" | "appointment";
  summary?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Appointment {
  id: string;
  contact_id?: string | null;
  title: string;
  description?: string | null;
  scheduled_at: string;
  status: AppointmentStatus;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_user_id?: string | null;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Analytics {
  total_calls: number;
  completed_calls: number;
  failed_calls: number;
  completion_rate: number;
  avg_duration_seconds: number;
  total_contacts: number;
  converted_leads: number;
  scheduled_appointments: number;
  active_workflows: number;
  calls_by_day: Array<{ date: string; calls: number }>;
  outcomes_breakdown: Record<string, number>;
  lead_funnel: Record<string, number>;
  workflow_run_stats: Record<string, unknown>;
}

export interface DashboardSnapshot {
  active_calls: number;
  calls_today: number;
  leads_today: number;
  appointments_today: number;
  recent_calls: CallRecord[];
  recent_notifications: Notification[];
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function authHeaders() {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const headers = new Headers(init?.headers);
  if (!isForm && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const { Authorization } = await authHeaders();
  if (Authorization) headers.set("Authorization", Authorization);
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!response.ok) throw new Error(await response.text());
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}

// ─── Workflows ────────────────────────────────────────────────────────────────

export const listWorkflows     = (tid: string) => apiFetch<Workflow[]>(`/tenants/${tid}/workflows`);
export const getWorkflow       = (tid: string, id: string) => apiFetch<Workflow>(`/tenants/${tid}/workflows/${id}`);
export const createWorkflow    = (tid: string, p: Partial<Workflow>) => apiFetch<Workflow>(`/tenants/${tid}/workflows`, { method: "POST", body: JSON.stringify(p) });
export const updateWorkflow    = (tid: string, id: string, p: Partial<Workflow>) => apiFetch<Workflow>(`/tenants/${tid}/workflows/${id}`, { method: "PUT", body: JSON.stringify(p) });
export const deleteWorkflow    = (tid: string, id: string) => apiFetch<void>(`/tenants/${tid}/workflows/${id}`, { method: "DELETE" });
export const cloneWorkflow     = (tid: string, id: string) => apiFetch<Workflow>(`/tenants/${tid}/workflows/${id}/clone`, { method: "POST" });
export const deleteWorkflowPermanently = (tid: string, id: string) => apiFetch<void>(`/tenants/${tid}/workflows/${id}/permanent`, { method: "DELETE" });
export const activateWorkflow  = (tid: string, id: string, active: boolean) => apiFetch<Workflow>(`/tenants/${tid}/workflows/${id}/activate`, { method: "POST", body: JSON.stringify({ active }) });
export const exportWorkflow    = (tid: string, id: string) => apiFetch<Record<string, unknown>>(`/tenants/${tid}/workflows/${id}/export`);
export const importWorkflow    = (tid: string, p: Record<string, unknown>) => apiFetch<Workflow>(`/tenants/${tid}/workflows/import`, { method: "POST", body: JSON.stringify(p) });

// Versions
export const listVersions  = (tid: string, id: string) => apiFetch<WorkflowVersion[]>(`/tenants/${tid}/workflows/${id}/versions`);
export const saveVersion   = (tid: string, id: string, config: Record<string, unknown>) => apiFetch<WorkflowVersion>(`/tenants/${tid}/workflows/${id}/versions`, { method: "POST", body: JSON.stringify({ config }) });
export const restoreVersion= (tid: string, id: string, vid: string) => apiFetch<Workflow>(`/tenants/${tid}/workflows/${id}/versions/${vid}/restore`, { method: "POST" });

// Runs
export const listRuns      = (tid: string, id: string) => apiFetch<WorkflowRun[]>(`/tenants/${tid}/workflows/${id}/runs`);
export const getRun        = (tid: string, id: string, rid: string) => apiFetch<WorkflowRun>(`/tenants/${tid}/workflows/${id}/runs/${rid}`);
export const listRunSteps  = (tid: string, id: string, rid: string) => apiFetch<WorkflowRunStep[]>(`/tenants/${tid}/workflows/${id}/runs/${rid}/steps`);

// ─── Calls ────────────────────────────────────────────────────────────────────

export const listCalls      = (tid: string, status?: string) => apiFetch<CallRecord[]>(`/tenants/${tid}/calls${status ? `?status=${status}` : ""}`);
export const testCall       = (tid: string, assistant_id: string, customer_phone: string) => apiFetch<CallRecord>(`/tenants/${tid}/calls/test`, { method: "POST", body: JSON.stringify({ assistant_id, customer_phone }) });
export const listActiveCalls= (tid: string) => apiFetch<CallRecord[]>(`/tenants/${tid}/calls/active`);
export const addCallEvent   = (tid: string, callId: string, p: Partial<CallMonitoringEvent>) => apiFetch<CallMonitoringEvent>(`/tenants/${tid}/calls/${callId}/events`, { method: "POST", body: JSON.stringify(p) });
export const listCallEvents = (tid: string, callId: string) => apiFetch<CallMonitoringEvent[]>(`/tenants/${tid}/calls/${callId}/events`);

// ─── Leads ────────────────────────────────────────────────────────────────────

export const listContacts       = (tid: string, q = "") => apiFetch<Contact[]>(`/tenants/${tid}/contacts${q ? `?q=${encodeURIComponent(q)}` : ""}`);
export const updateContact      = (tid: string, id: string, data: Partial<Contact>) => apiFetch<Contact>(`/tenants/${tid}/contacts/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteContact      = (tid: string, id: string) => apiFetch<void>(`/tenants/${tid}/contacts/${id}`, { method: "DELETE" });
export const deleteContactsBulk = async (tid: string, ids: string[]) => { await Promise.all(ids.map((id) => deleteContact(tid, id))); };
export const listLeadActivities = (tid: string, limit = 50) => apiFetch<LeadActivity[]>(`/tenants/${tid}/leads/activities?limit=${limit}`);
export const listContactActivities = (tid: string, cid: string) => apiFetch<LeadActivity[]>(`/tenants/${tid}/leads/${cid}/activities`);

// ─── Appointments ─────────────────────────────────────────────────────────────

export const listAppointments  = (tid: string, status?: string) => apiFetch<Appointment[]>(`/tenants/${tid}/appointments${status ? `?status=${status}` : ""}`);
export const createAppointment = (tid: string, p: Partial<Appointment>) => apiFetch<Appointment>(`/tenants/${tid}/appointments`, { method: "POST", body: JSON.stringify(p) });
export const updateAppointment = (tid: string, id: string, p: Partial<Appointment>) => apiFetch<Appointment>(`/tenants/${tid}/appointments/${id}`, { method: "PATCH", body: JSON.stringify(p) });
export const deleteAppointment = (tid: string, id: string) => apiFetch<void>(`/tenants/${tid}/appointments/${id}`, { method: "DELETE" });

// ─── Notifications ────────────────────────────────────────────────────────────

export const listNotifications  = (tid: string, unreadOnly = false) => apiFetch<Notification[]>(`/tenants/${tid}/notifications?unread_only=${unreadOnly}`);
export const markNotificationsRead  = (tid: string, ids: string[]) => apiFetch(`/tenants/${tid}/notifications/mark-read`, { method: "POST", body: JSON.stringify({ ids }) });
export const markAllNotificationsRead = (tid: string) => apiFetch(`/tenants/${tid}/notifications/mark-all-read`, { method: "POST" });

// ─── Analytics ────────────────────────────────────────────────────────────────

export const getAnalytics        = (tid: string, days = 30) => apiFetch<Analytics>(`/tenants/${tid}/analytics?days=${days}`);
export const getDashboardSnapshot= (tid: string) => apiFetch<DashboardSnapshot>(`/tenants/${tid}/analytics/dashboard`);

// ─── Audit Logs ───────────────────────────────────────────────────────────────

export const listAuditLogs = (tid: string, resourceType?: string) => apiFetch<AuditLog[]>(`/tenants/${tid}/audit-logs${resourceType ? `?resource_type=${resourceType}` : ""}`);

// ─── Campaigns ────────────────────────────────────────────────────────────────

export const listCampaigns   = (tid: string) => apiFetch<Campaign[]>(`/tenants/${tid}/campaigns`);
export const createCampaign  = (tid: string, data: { name: string; vapi_assistant_id: string; contact_ids: string[]; scheduled_at?: string | null }) =>
  apiFetch<Campaign>(`/tenants/${tid}/campaigns`, { method: "POST", body: JSON.stringify(data) });
export const campaignAction  = (tid: string, cid: string, action: "pause" | "resume" | "cancel" | "clone" | "launch") => apiFetch<Campaign>(`/tenants/${tid}/campaigns/${cid}/${action}`, { method: "POST" });
export const updateCampaign  = (tid: string, cid: string, data: { name?: string; vapi_assistant_id?: string; contact_ids?: string[]; scheduled_at?: string | null }) =>
  apiFetch<Campaign>(`/tenants/${tid}/campaigns/${cid}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteCampaign  = (tid: string, cid: string) => apiFetch<void>(`/tenants/${tid}/campaigns/${cid}`, { method: "DELETE" });
export const getCampaignContactIds = (tid: string, cid: string) => apiFetch<string[]>(`/tenants/${tid}/campaigns/${cid}/contact-ids`);

// ─── Integrations ─────────────────────────────────────────────────────────────

export const listIntegrations    = (tid: string) => apiFetch<Integration[]>(`/tenants/${tid}/integrations`);
export const refreshVapiAssistants = (tid: string) => apiFetch<any[]>(`/tenants/${tid}/integrations/vapi/refresh-assistants`, { method: "POST" });
export const listMyAssistants = (tid: string) => apiFetch<{ external_id: string; label: string }[]>(`/tenants/${tid}/assistants`);
export const getMySettings = (tid: string) => apiFetch<{ timezone: string | null }>(`/tenants/${tid}/settings/me`);
export const updateMySettings = (tid: string, timezone: string) =>
  apiFetch<{ ok: boolean; timezone: string }>(`/tenants/${tid}/settings/me`, { method: "PATCH", body: JSON.stringify({ timezone }) });
export const connectIntegration  = (tid: string, provider: string, p: Record<string, unknown>) => apiFetch<Integration>(`/tenants/${tid}/integrations/${provider}/connect`, { method: "POST", body: JSON.stringify(p) });
export const disconnectIntegration = (tid: string, provider: string) => apiFetch<Integration | null>(`/tenants/${tid}/integrations/${provider}/disconnect`, { method: "POST" });
export const listAssets          = (tid: string, provider: "vapi" | "twilio" | "make") => apiFetch<IntegrationAsset[]>(`/tenants/${tid}/integrations/${provider}/assets`);
export const importContacts      = (tid: string, file: File) => { const form = new FormData(); form.append("file", file); return apiFetch(`/tenants/${tid}/contacts/import`, { method: "POST", body: form }); };
export const createContact       = (tid: string, p: Partial<Contact>) => apiFetch<Contact>(`/tenants/${tid}/contacts`, { method: "POST", body: JSON.stringify(p) });
