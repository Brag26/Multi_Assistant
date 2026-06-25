"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

// ─── Demo Data ────────────────────────────────────────────────────────────────

export const DEMO_DATA = {
  snapshot: {
    active_calls: 3,
    calls_today: 47,
    leads_today: 12,
    appointments_today: 8,
    recent_calls: [
      { id: "1", customer_phone: "+91 98765 43210", status: "completed", outcome: "qualified", duration_seconds: 187 },
      { id: "2", customer_phone: "+91 87654 32109", status: "completed", outcome: "converted", duration_seconds: 243 },
      { id: "3", customer_phone: "+91 76543 21098", status: "completed", outcome: "not_interested", duration_seconds: 45 },
      { id: "4", customer_phone: "+91 65432 10987", status: "failed", outcome: "no_answer", duration_seconds: 0 },
      { id: "5", customer_phone: "+91 54321 09876", status: "completed", outcome: "qualified", duration_seconds: 312 },
    ],
  },
  activeCalls: [
    { id: "a1", customer_phone: "+91 99887 76655", status: "in_progress", started_at: new Date(Date.now() - 120000).toISOString() },
    { id: "a2", customer_phone: "+91 88776 65544", status: "in_progress", started_at: new Date(Date.now() - 45000).toISOString() },
    { id: "a3", customer_phone: "+91 77665 54433", status: "in_progress", started_at: new Date(Date.now() - 8000).toISOString() },
  ],
  analytics: {
    total_calls: 1247,
    completed_calls: 1089,
    failed_calls: 158,
    completion_rate: 0.8732,
    avg_duration_seconds: 198,
    total_contacts: 3842,
    converted_leads: 312,
    scheduled_appointments: 89,
    active_workflows: 4,
    calls_by_day: [
      { day: "2026-06-19", count: 38 },
      { day: "2026-06-20", count: 52 },
      { day: "2026-06-21", count: 61 },
      { day: "2026-06-22", count: 44 },
      { day: "2026-06-23", count: 73 },
      { day: "2026-06-24", count: 58 },
      { day: "2026-06-25", count: 47 },
    ],
    outcomes_breakdown: { qualified: 412, converted: 312, not_interested: 198, no_answer: 158, voicemail: 167 },
    lead_funnel: { new: 1200, contacted: 890, qualified: 412, converted: 312 },
    workflow_run_stats: { completed: 234, failed: 12, running: 4 },
  },
  contacts: [
    { id: "c1", first_name: "Rahul", last_name: "Sharma", phone: "+91 98765 43210", email: "rahul@techcorp.in", company: "TechCorp India", lead_status: "qualified" },
    { id: "c2", first_name: "Priya", last_name: "Patel", phone: "+91 87654 32109", email: "priya@startup.io", company: "StartupIO", lead_status: "converted" },
    { id: "c3", first_name: "Arjun", last_name: "Mehta", phone: "+91 76543 21098", email: "arjun@enterprises.com", company: "Mehta Enterprises", lead_status: "new" },
    { id: "c4", first_name: "Kavya", last_name: "Reddy", phone: "+91 65432 10987", email: "kavya@solutions.co", company: "Reddy Solutions", lead_status: "contacted" },
    { id: "c5", first_name: "Vikram", last_name: "Singh", phone: "+91 54321 09876", email: "vikram@ventures.in", company: "Singh Ventures", lead_status: "qualified" },
    { id: "c6", first_name: "Ananya", last_name: "Iyer", phone: "+91 43210 98765", email: "ananya@consulting.in", company: "Iyer Consulting", lead_status: "new" },
  ],
  campaigns: [
    { id: "cp1", name: "Q2 Lead Generation", status: "running", config: {}, created_at: "2026-06-01" },
    { id: "cp2", name: "Insurance Renewal Calls", status: "completed", config: {}, created_at: "2026-05-15" },
    { id: "cp3", name: "Product Demo Outreach", status: "draft", config: {}, created_at: "2026-06-20" },
  ],
  notifications: [
    { id: "n1", title: "New qualified lead", message: "Rahul Sharma from TechCorp India was qualified", type: "success", read: false, created_at: new Date(Date.now() - 300000).toISOString() },
    { id: "n2", title: "Appointment booked", message: "Priya Patel scheduled a demo for tomorrow 3 PM", type: "info", read: false, created_at: new Date(Date.now() - 900000).toISOString() },
    { id: "n3", title: "Campaign milestone", message: "Q2 Lead Generation reached 50% completion", type: "success", read: true, created_at: new Date(Date.now() - 3600000).toISOString() },
    { id: "n4", title: "Call failed", message: "3 calls failed in the last hour - check Twilio status", type: "warning", read: true, created_at: new Date(Date.now() - 7200000).toISOString() },
  ],
  workflows: [
    { id: "w1", name: "Lead Qualification Flow", status: "active", trigger_type: "inbound_call", nodes: [], edges: [], builder_version: 1, config: {}, created_at: "2026-06-01" },
    { id: "w2", name: "Appointment Booking", status: "active", trigger_type: "qualified_lead", nodes: [], edges: [], builder_version: 1, config: {}, created_at: "2026-06-10" },
    { id: "w3", name: "Follow-up Sequence", status: "draft", trigger_type: "no_answer", nodes: [], edges: [], builder_version: 1, config: {}, created_at: "2026-06-20" },
  ],
  integrations: [
    { id: "i1", provider: "vapi", name: "Vapi Production", config: {}, connected_at: "2026-06-01" },
    { id: "i2", provider: "exotel", name: "Exotel India", config: {}, connected_at: "2026-06-01" },
    { id: "i3", provider: "make", name: "Make.com Automation", config: {}, connected_at: "2026-06-05" },
    { id: "i4", provider: "slack", name: "Team Slack", config: {}, connected_at: "2026-06-05" },
  ],
};

// ─── Context ──────────────────────────────────────────────────────────────────

interface DemoContextType {
  isDemo: boolean;
  setIsDemo: (v: boolean) => void;
}

const DemoContext = createContext<DemoContextType>({ isDemo: false, setIsDemo: () => {} });

export function DemoProvider({ children }: { children: ReactNode }) {
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    // Persist demo mode in sessionStorage (clears on tab close)
    const stored = sessionStorage.getItem("voiceops_demo");
    if (stored === "true") setIsDemo(true);
  }, []);

  function setIsDemoWrapped(v: boolean) {
    setIsDemo(v);
    if (v) sessionStorage.setItem("voiceops_demo", "true");
    else sessionStorage.removeItem("voiceops_demo");
  }

  return (
    <DemoContext.Provider value={{ isDemo, setIsDemo: setIsDemoWrapped }}>
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo() {
  return useContext(DemoContext);
}
