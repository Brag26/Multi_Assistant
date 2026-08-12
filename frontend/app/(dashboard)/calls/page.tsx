"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, FileText } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { DataTable } from "@/components/dashboard/data-table";
import type { CallStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/store/session";
import { listCalls, getRecordingUrl, type CallRecord } from "@/lib/api";
import { RecordingDownloadMenu } from "@/components/dashboard/RecordingDownloadMenu";

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

const STATUS_STYLE: Record<CallStatus, string> = {
  queued: "bg-slate-100 text-slate-600",
  in_progress: "bg-blue-50 text-blue-700",
  completed: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
  canceled: "bg-slate-100 text-slate-500",
};

// Vapi's raw endedReason codes aren't something a client should have to
// decode themselves — show a plain-English reason for the common ones and
// fall back to the raw code (still shown in full via the title tooltip).
function friendlyEndedReason(reason: string | null | undefined): string | null {
  if (!reason) return null;
  const known: Record<string, string> = {
    "call.start.error-get-transport": "Couldn't connect the outbound number (check Twilio setup)",
    "call.start.error-vapifault-database-error": "Vapi internal error — retry or contact Vapi support",
    "call.start.error-vapi-number-international": "International calling not enabled for this number",
    "call.start.error-vapi-number-outbound-daily-limit": "Daily outbound limit reached for this number",
    "assistant-not-found": "Assistant not found",
    "customer-did-not-answer": "No answer",
    "customer-busy": "Line busy",
  };
  return known[reason] ?? reason.replace(/[-_]/g, " ");
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
    const url = await getRecordingUrl(tenantId, callId);
    window.open(url, "_blank");
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
            {
              key: "status",
              label: "Status",
              render: (row) => (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[row.status] ?? ""}`}>
                  {row.status.replace("_", " ")}
                </span>
              ),
            },
            {
              key: "ended_reason",
              label: "Ended Reason",
              render: (row) => {
                const friendly = friendlyEndedReason(row.ended_reason);
                if (!friendly) return <span className="text-slate-400">—</span>;
                return (
                  <span
                    title={row.ended_reason ?? ""}
                    className={row.status === "failed" ? "text-red-600 text-xs" : "text-slate-500 text-xs"}
                  >
                    {friendly}
                  </span>
                );
              },
            },
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
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => openRecording(tenantId, row.id)}
                      className="text-indigo-600 hover:text-indigo-700 text-xs font-medium"
                    >
                      Open
                    </button>
                    <RecordingDownloadMenu
                      tenantId={tenantId}
                      callId={row.id}
                      filenamePrefix={row.customer_phone.replace(/[^0-9+]/g, "")}
                    />
                  </div>
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
