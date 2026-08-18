"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Trash2 } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { DataTable } from "@/components/dashboard/data-table";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/store/session";
import { listCalls, getRecordingUrl, deleteCall, bulkDeleteCalls, type CallRecord } from "@/lib/api";
import { RecordingDownloadMenu } from "@/components/dashboard/RecordingDownloadMenu";
import { ViewAsSelector } from "@/components/dashboard/ViewAsSelector";

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
    const url = await getRecordingUrl(tenantId, callId);
    window.open(url, "_blank");
  } catch {
    alert("Couldn't load this recording.");
  }
}

export default function CallsPage() {
  const tenantId = useSessionStore((s) => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const viewAsUserId = useSessionStore((s) => s.viewAsUserId);
  const role = useSessionStore((s) => s.role);
  const canDelete = role === "super_admin" || role === "tenant_admin";
  const queryClient = useQueryClient();

  const { data = [], isLoading } = useQuery({
    queryKey: ["calls", tenantId, viewAsUserId],
    queryFn: () => listCalls(tenantId, undefined, viewAsUserId),
    enabled: Boolean(tenantId),
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const allSelected = data.length > 0 && selected.size === data.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(data.map((r) => r.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleDeleteSelected() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} call${selected.size === 1 ? "" : "s"}? This can't be undone.`)) return;
    setDeleting(true);
    try {
      await bulkDeleteCalls(tenantId, Array.from(selected));
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["calls", tenantId] });
    } catch (err: any) {
      alert(err?.message || "Couldn't delete those calls.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleDeleteOne(id: string) {
    if (!confirm("Delete this call? This can't be undone.")) return;
    try {
      await deleteCall(tenantId, id);
      setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
      queryClient.invalidateQueries({ queryKey: ["calls", tenantId] });
    } catch (err: any) {
      alert(err?.message || "Couldn't delete this call.");
    }
  }

  const transcriptCount = data.filter((r) => r.transcript).length;

  return (
    <DashboardShell>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-blue-700">Call history</p>
          <h2 className="text-2xl font-semibold tracking-tight">Calls</h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ViewAsSelector />
          {canDelete && selected.size > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
              disabled={deleting}
              onClick={handleDeleteSelected}
            >
              <Trash2 className="w-3.5 h-3.5" /> {deleting ? "Deleting…" : `Delete Selected (${selected.size})`}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={transcriptCount === 0}
            onClick={() => downloadAllTranscripts(data)}
          >
            <Download className="w-3.5 h-3.5" /> Download All Transcripts ({transcriptCount})
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <DataTable<CallRecord>
          rows={data}
          columns={[
            ...(canDelete ? [{
              key: "__select",
              label: (
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
              ),
              render: (row: CallRecord) => (
                <input
                  type="checkbox"
                  checked={selected.has(row.id)}
                  onChange={() => toggleOne(row.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
              ),
            }] : []),
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
            ...(canDelete ? [{
              key: "__delete",
              label: "",
              render: (row: CallRecord) => (
                <button
                  onClick={() => handleDeleteOne(row.id)}
                  title="Delete this call"
                  className="text-slate-300 hover:text-red-600"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              ),
            }] : []),
          ]}
        />
      )}
    </DashboardShell>
  );
}
