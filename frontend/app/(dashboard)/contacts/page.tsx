"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSessionStore } from "@/store/session";
import { listContacts, type Contact } from "@/lib/api";
import { DashboardShell } from "@/components/dashboard/shell";
import { CsvImportModal } from "@/components/dashboard/CsvImportModal";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Search, Users } from "lucide-react";

const LEAD_STATUS_COLORS: Record<string, string> = {
  new: "bg-slate-100 text-slate-600", contacted: "bg-blue-50 text-blue-700",
  qualified: "bg-violet-50 text-violet-700", nurturing: "bg-amber-50 text-amber-700",
  converted: "bg-emerald-50 text-emerald-700", lost: "bg-red-50 text-red-700",
};

export default function ContactsPage() {
  const tenantId = useSessionStore(s => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const [search, setSearch] = useState("");
  const [showImport, setShowImport] = useState(false);

  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ["contacts", tenantId, search],
    queryFn: () => listContacts(tenantId, search),
    enabled: Boolean(tenantId),
  });

  return (
    <DashboardShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-blue-700">CRM</p>
          <h2 className="text-2xl font-semibold tracking-tight">Contacts</h2>
        </div>
        <Button onClick={() => setShowImport(true)} className="gap-1.5">
          <Upload className="w-4 h-4" /> Import CSV
        </Button>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        <input
          className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Search contacts…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(6)].map((_, i) => <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />)}
            </div>
          ) : contacts.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No contacts yet</p>
              <Button size="sm" variant="ghost" className="mt-2 gap-1.5" onClick={() => setShowImport(true)}>
                <Upload className="w-3.5 h-3.5" /> Import your first contacts
              </Button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-slate-500">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Added</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map(c => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium">
                      {[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{c.phone}</td>
                    <td className="px-4 py-2.5 text-slate-500">{c.email || "—"}</td>
                    <td className="px-4 py-2.5 text-slate-500">{c.company || "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full capitalize font-medium ${LEAD_STATUS_COLORS[c.lead_status] ?? ""}`}>
                        {c.lead_status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {showImport && <CsvImportModal tenantId={tenantId} onClose={() => setShowImport(false)} />}
    </DashboardShell>
  );
}
