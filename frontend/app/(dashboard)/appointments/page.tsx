"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSessionStore } from "@/store/session";
import { listAppointments, updateAppointment, type Appointment } from "@/lib/api";
import { DashboardShell } from "@/components/dashboard/shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarCheck, Clock, CheckCircle, XCircle } from "lucide-react";

const STATUS_STYLE: Record<string, string> = {
  scheduled: "bg-blue-50 text-blue-700 border-blue-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  canceled:  "bg-red-50 text-red-700 border-red-200",
};

export default function AppointmentsPage() {
  const tenantId = useSessionStore(s => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string | undefined>("scheduled");

  const { data: appointments = [], isLoading } = useQuery<Appointment[]>({
    queryKey: ["appointments", tenantId, statusFilter],
    queryFn: () => listAppointments(tenantId, statusFilter),
    enabled: Boolean(tenantId),
    refetchInterval: 30_000,
  });

  const updateMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "scheduled" | "completed" | "canceled" }) =>
      updateAppointment(tenantId, id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["appointments", tenantId] }),
  });

  return (
    <DashboardShell>
      <div className="mb-6">
        <p className="text-sm font-medium text-blue-700">Scheduling</p>
        <h2 className="text-2xl font-semibold tracking-tight">Appointments</h2>
      </div>

      <div className="flex gap-1.5 mb-4">
        {[undefined, "scheduled", "completed", "canceled"].map(s => (
          <Button key={String(s)} size="sm"
            variant={statusFilter === s ? "default" : "ghost"}
            className="h-7 px-3 text-xs capitalize"
            onClick={() => setStatusFilter(s)}>
            {s ?? "All"}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : appointments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-400">
            <CalendarCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No appointments {statusFilter ? `with status "${statusFilter}"` : "found"}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {appointments.map(a => (
            <Card key={a.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <CalendarCheck className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">{a.title}</h3>
                    {a.description && (
                      <p className="text-xs text-slate-500 mt-0.5">{a.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                      <Clock className="w-3 h-3" />
                      {new Date(a.scheduled_at).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs px-2.5 py-1 rounded-full border font-medium capitalize ${STATUS_STYLE[a.status] ?? ""}`}>
                    {a.status}
                  </span>
                  {a.status === "scheduled" && (
                    <>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-emerald-600 hover:text-emerald-700"
                        title="Mark completed"
                        onClick={() => updateMut.mutate({ id: a.id, status: "completed" })}>
                        <CheckCircle className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-red-400 hover:text-red-600"
                        title="Cancel"
                        onClick={() => updateMut.mutate({ id: a.id, status: "canceled" })}>
                        <XCircle className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
