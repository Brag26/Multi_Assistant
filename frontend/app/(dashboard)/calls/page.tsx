"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, FileText } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { DataTable } from "@/components/dashboard/data-table";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/store/session";
import { listCalls, apiFetch, type CallRecord } from "@/lib/api";

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function transcriptFilename(row: CallRecord): string {
  const date = row.started_at ? new Date(row.started_at).toISOString().slice(0, 10) : "call";
  return `transcript_${row.customer_phone.replace(/[^0-9+]/g, "")}_${date}.txt`;
}

function downloadAllTranscripts(rows: CallRecord[]) {
  const withTranscripts = rows.filter((r) => r.transcript);
  if (withTranscripts.length === 0) return;
  const combined = withTranscripts
    .map((r) => {
      const header = `=== Call: ${r.customer_phone} · ${r.started_at ? new Date(r.started_at).toLocaleString() : "unknown time"} · ${r.outcome} ===`;
      return `${header}\n${r.transcript}\n`;
    })
    .join("\n\n");
  downloadText(`transcripts_${new Date().toISOString().slice(0, 10)}.txt`, combined);
}

async function openRecording(tenantId: string, callId: string) {
  try {
    const res = await apiFetch<{ recording_url: string }>(`/tenants/${tenantId}/calls/${callId}/recording-url`);
    window.open(res.recording_url, "_blank");
  } catch {
    alert("Couldn't load this recording.");
  }
}

export default function CallsPage() {
  const tenantId = useSessionStore((s) => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const { data = [], isLoading } = useQuery({
    queryKey: ["calls", tenantId],
    queryFn: () => listCalls(tenantId),
    enabled: Boolean(tenantId),
  });

  const transcriptCount = data.filter((r) => r.transcript).length;

  return (
    <DashboardShell>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-blue-700">Call history</p>
          <h2 className="text-2xl font-semibold tracking-tight">Calls</h2>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 shrink-0"
          disabled={transcriptCount === 0}
          onClick={() => downloadAllTranscripts(data)}
        >
          <Download className="w-3.5 h-3.5" /> Download All Transcripts ({transcriptCount})
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <DataTable<CallRecord>
          rows={data}
          columns={[
            { key: "customer_phone", label: "Phone" },
            { key: "campaign_id", label: "Campaign" },
            { key: "assistant_id", label: "Assistant" },
            { key: "duration_seconds", label: "Duration" },
            { key: "outcome", label: "Outcome" },
            { key: "summary", label: "Summary" },
            {
              key: "transcript",
              label: "Transcript",
              render: (row) =>
                row.transcript ? (
                  <button
                    onClick={() => downloadText(transcriptFilename(row), row.transcript!)}
                    className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    <FileText className="w-3.5 h-3.5" /> Download
                  </button>
                ) : (
                  <span className="text-slate-400">—</span>
                ),
            },
            {
              key: "recording_url",
              label: "Recording",
              render: (row) =>
                row.recording_url ? (
                  <button
                    onClick={() => openRecording(tenantId, row.id)}
                    className="text-indigo-600 hover:text-indigo-700 text-xs font-medium"
                  >
                    Open
                  </button>
                ) : (
                  <span className="text-slate-400">—</span>
                ),
            },
          ]}
        />
      )}
    </DashboardShell>
  );
}
