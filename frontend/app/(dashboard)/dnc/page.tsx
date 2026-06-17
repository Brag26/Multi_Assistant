"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSessionStore } from "@/store/session";
import { listDnc, addToDnc, removeFromDnc, type DncEntry } from "@/lib/api-features";
import { DashboardShell } from "@/components/dashboard/shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldOff, Plus, Trash2, Phone } from "lucide-react";

export default function DncPage() {
  const tenantId = useSessionStore(s => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [showForm, setShowForm] = useState(false);

  const { data: entries = [], isLoading } = useQuery<DncEntry[]>({
    queryKey: ["dnc", tenantId],
    queryFn: () => listDnc(tenantId),
    enabled: Boolean(tenantId),
  });

  const addMut = useMutation({
    mutationFn: () => addToDnc(tenantId, phone, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dnc", tenantId] });
      setPhone(""); setReason(""); setShowForm(false);
    },
  });

  const removeMut = useMutation({
    mutationFn: (p: string) => removeFromDnc(tenantId, p),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dnc", tenantId] }),
  });

  return (
    <DashboardShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-blue-700">Compliance</p>
          <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ShieldOff className="w-6 h-6" /> Do Not Call List
          </h2>
        </div>
        <Button onClick={() => setShowForm(s => !s)} className="gap-1.5">
          <Plus className="w-4 h-4" /> Add Number
        </Button>
      </div>

      {showForm && (
        <Card className="mb-4 border-blue-200">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-medium">Add to DNC list</p>
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Phone number: +15550001234"
              value={phone} onChange={e => setPhone(e.target.value)} />
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Reason (optional)"
              value={reason} onChange={e => setReason(e.target.value)} />
            <div className="flex gap-2">
              <Button onClick={() => addMut.mutate()} disabled={!phone || addMut.isPending}>
                {addMut.isPending ? "Adding…" : "Add to DNC"}
              </Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />)}
            </div>
          ) : entries.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <ShieldOff className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No numbers on the DNC list.</p>
              <p className="text-xs mt-1">Numbers added here will be skipped automatically during campaign calls.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-slate-500">
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Added</th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2.5 flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-mono text-sm">{e.phone}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{e.reason || "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">{new Date(e.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-2.5">
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400 hover:text-red-600"
                        onClick={() => removeMut.mutate(e.phone)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </DashboardShell>
  );
}
