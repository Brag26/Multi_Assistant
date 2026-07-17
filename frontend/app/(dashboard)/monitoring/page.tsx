"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSessionStore } from "@/store/session";
import { listCalls, listCallEvents, apiFetch, type CallRecord, type CallMonitoringEvent } from "@/lib/api";
import { DashboardShell } from "@/components/dashboard/shell";
import { LiveTranscriptPanel } from "@/components/dashboard/LiveTranscriptPanel";
import { TestCallModal } from "@/components/dashboard/TestCallModal";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PhoneCall, Activity, Clock, Mic } from "lucide-react";

const STATUS_STYLE: Record<string, string> = {
  completed:   "bg-emerald-50 text-emerald-700",
  failed:      "bg-red-50 text-red-700",
  in_progress: "bg-blue-50 text-blue-700 animate-pulse",
  queued:      "bg-slate-100 text-slate-600",
  canceled:    "bg-slate-100 text-slate-400",
};

export default function CallMonitoringPage() {
  const tenantId = useSessionStore(s => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [recordingLoading, setRecordingLoading] = useState(false);
  const [recordingError, setRecordingError] = useState(false);
  const [testCallOpen, setTestCallOpen] = useState(false);

  const { data: calls = [], isLoading } = useQuery<CallRecord[]>({
    queryKey: ["calls", tenantId, statusFilter],
    queryFn: () => listCalls(tenantId, statusFilter),
    enabled: Boolean(tenantId),
    refetchInterval: 8_000,
  });

  const { data: events = [] } = useQuery({
    queryKey: ["call-events", tenantId, selectedCallId],
    queryFn: () => listCallEvents(tenantId, selectedCallId!),
    enabled: Boolean(tenantId) && Boolean(selectedCallId),
    refetchInterval: 3_000,
  });

  const selectedCall = calls.find(c => c.id === selectedCallId);

  useEffect(() => {
    setRecordingUrl(null);
    setRecordingError(false);
    if (!selectedCall?.recording_url || !tenantId) return;
    setRecordingLoading(true);
    apiFetch<{ recording_url: string }>(`/tenants/${tenantId}/calls/${selectedCall.id}/recording-url`)
      .then((res) => setRecordingUrl(res.recording_url))
      .catch(() => setRecordingError(true))
      .finally(() => setRecordingLoading(false));
  }, [selectedCall?.id, tenantId]);
  const isCallActive = selectedCall?.status === "in_progress";

  return (
    <DashboardShell>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-blue-700">Operations</p>
          <h2 className="text-2xl font-semibold tracking-tight">Call Monitoring</h2>
        </div>
        <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setTestCallOpen(true)}>
          <PhoneCall className="w-3.5 h-3.5" /> Test Call
        </Button>
      </div>
      <TestCallModal tenantId={tenantId} open={testCallOpen} onClose={() => setTestCallOpen(false)} />

      {/* Filter tabs */}
      <div className="flex gap-1.5 mb-4">
        {[undefined, "in_progress", "completed", "failed"].map(s => (
          <Button key={String(s)} size="sm" variant={statusFilter === s ? "default" : "ghost"}
            className="h-7 px-3 text-xs capitalize" onClick={() => setStatusFilter(s)}>
            {s ? s.replace("_", " ") : "All"}
          </Button>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Call list */}
        <div className="lg:col-span-1 space-y-2">
          {isLoading ? (
            [...Array(4)].map((_, i) => (
              <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
            ))
          ) : calls.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-slate-400 text-sm">No calls found</CardContent></Card>
          ) : (
            calls.map(call => (
              <button key={call.id}
                className={`w-full text-left border rounded-lg px-4 py-3 transition-all hover:shadow-sm ${
                  selectedCallId === call.id ? "border-blue-400 bg-blue-50" : "bg-white border-slate-200"
                }`}
                onClick={() => setSelectedCallId(call.id)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PhoneCall className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="font-mono text-sm font-medium">{call.customer_phone}</span>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[call.status] ?? ""}`}>
                    {call.status.replace("_", " ")}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {call.duration_seconds ? `${call.duration_seconds}s` : "—"}
                  </span>
                  <span className="capitalize">{call.outcome?.replace("_", " ")}</span>
                  <span>{new Date(call.created_at).toLocaleTimeString()}</span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Call detail */}
        <div className="lg:col-span-2">
          {!selectedCall ? (
            <Card className="h-full flex items-center justify-center">
              <CardContent className="py-16 text-center text-slate-400">
                <PhoneCall className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Select a call to view details</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Summary card */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{selectedCall.customer_phone}</h3>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_STYLE[selectedCall.status] ?? ""}`}>
                      {selectedCall.status.replace("_", " ")}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <div><dt className="text-slate-400 text-xs">Outcome</dt><dd className="font-medium mt-0.5 capitalize">{selectedCall.outcome?.replace("_", " ")}</dd></div>
                    <div><dt className="text-slate-400 text-xs">Duration</dt><dd className="font-medium mt-0.5">{selectedCall.duration_seconds ? `${selectedCall.duration_seconds}s` : "—"}</dd></div>
                    <div><dt className="text-slate-400 text-xs">Started</dt><dd className="font-medium mt-0.5">{selectedCall.started_at ? new Date(selectedCall.started_at).toLocaleTimeString() : "—"}</dd></div>
                    <div><dt className="text-slate-400 text-xs">Ended</dt><dd className="font-medium mt-0.5">{selectedCall.ended_at ? new Date(selectedCall.ended_at).toLocaleTimeString() : "—"}</dd></div>
                  </dl>
                  {selectedCall.summary && (
                    <div className="mt-3 p-3 bg-slate-50 rounded-lg text-sm text-slate-600">
                      <p className="text-xs font-medium text-slate-400 mb-1">AI Summary</p>
                      {selectedCall.summary}
                    </div>
                  )}
                  {selectedCall.recording_url && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-slate-400 mb-1 flex items-center gap-1">
                        <Mic className="w-3 h-3" /> Recording
                      </p>
                      {recordingLoading ? (
                        <p className="text-xs text-slate-400">Loading recording…</p>
                      ) : recordingError ? (
                        <p className="text-xs text-amber-600">Couldn't load recording — it may have expired or Vapi's storage settings changed.</p>
                      ) : recordingUrl ? (
                        <audio controls src={recordingUrl} className="w-full h-8" />
                      ) : null}
                    </div>
                  )}
                  {selectedCall.success_evaluation && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-slate-400 mb-1">Success Evaluation</p>
                      <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium ${
                        /^(true|pass|good|qualified)/i.test(selectedCall.success_evaluation)
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}>
                        {selectedCall.success_evaluation}
                      </span>
                    </div>
                  )}
                  {selectedCall.structured_data && Object.keys(selectedCall.structured_data).length > 0 && (
                    <div className="mt-3 p-3 bg-slate-50 rounded-lg">
                      <p className="text-xs font-medium text-slate-400 mb-2">Structured Data</p>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        {Object.entries(selectedCall.structured_data).map(([key, value]) => (
                          <div key={key}>
                            <dt className="text-slate-400 text-xs capitalize">{key.replace(/_/g, " ")}</dt>
                            <dd className="font-medium mt-0.5 break-words">
                              {typeof value === "object" ? JSON.stringify(value) : String(value)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Live transcript — polls while call is in progress */}
              <LiveTranscriptPanel
                tenantId={tenantId}
                callId={selectedCall.id}
                isActive={isCallActive}
              />

              {/* Event timeline */}
              <Card>
                <CardHeader className="pb-2">
                  <h3 className="font-semibold text-sm flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-slate-400" /> Event Timeline
                  </h3>
                </CardHeader>
                <CardContent className="p-0">
                  {events.length === 0 ? (
                    <p className="text-sm text-slate-400 px-4 py-4">No events recorded</p>
                  ) : (
                    <ul className="divide-y max-h-64 overflow-y-auto">
                      {events.map((ev: CallMonitoringEvent) => (
                        <li key={ev.id} className="px-4 py-2.5 flex items-start gap-3 text-xs">
                          <span className="text-slate-400 shrink-0 w-20">
                            {new Date(ev.recorded_at).toLocaleTimeString()}
                          </span>
                          <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[10px] shrink-0">
                            {ev.event_type}
                          </span>
                          <span className="text-slate-500 truncate">
                            {JSON.stringify(ev.event_data).slice(0, 80)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
