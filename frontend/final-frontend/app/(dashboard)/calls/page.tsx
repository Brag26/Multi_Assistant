"use client";

import { useQuery } from "@tanstack/react-query";
import { DashboardShell } from "@/components/dashboard/shell";
import { DataTable } from "@/components/dashboard/data-table";
import { listCalls, type CallRecord } from "@/lib/api";

const tenantId = process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";

export default function CallsPage() {
  const { data = [] } = useQuery({ queryKey: ["calls"], queryFn: () => listCalls(tenantId), enabled: Boolean(tenantId) });
  return (
    <DashboardShell>
      <div className="mb-6"><p className="text-sm font-medium text-blue-700">Call history</p><h2 className="text-2xl font-semibold tracking-tight">Calls</h2></div>
      <DataTable<CallRecord> rows={data} columns={[{ key: "customer_phone", label: "Phone" }, { key: "campaign_id", label: "Campaign" }, { key: "assistant_id", label: "Assistant" }, { key: "duration_seconds", label: "Duration" }, { key: "outcome", label: "Outcome" }, { key: "summary", label: "Summary" }, { key: "recording_url", label: "Recording", render: (row) => row.recording_url ? <a className="text-blue-700" href={row.recording_url}>Open</a> : "-" }]} />
    </DashboardShell>
  );
}
