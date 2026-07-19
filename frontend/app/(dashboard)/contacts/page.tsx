"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSessionStore } from "@/store/session";
import { listContacts, updateContact, deleteContact, deleteContactsBulk, type Contact } from "@/lib/api";
import { DashboardShell } from "@/components/dashboard/shell";
import { CsvImportModal } from "@/components/dashboard/CsvImportModal";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, Search, Users, Pencil, Trash2, X, Check } from "lucide-react";

const LEAD_STATUS_COLORS: Record<string, string> = {
  new: "bg-slate-100 text-slate-600", contacted: "bg-blue-50 text-blue-700",
  qualified: "bg-violet-50 text-violet-700", nurturing: "bg-amber-50 text-amber-700",
  converted: "bg-emerald-50 text-emerald-700", lost: "bg-red-50 text-red-700",
};

export default function ContactsPage() {
  const tenantId = useSessionStore(s => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Contact>>({});

  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ["contacts", tenantId, search],
    queryFn: () => listContacts(tenantId, search),
    enabled: Boolean(tenantId),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Contact> }) => updateContact(tenantId, id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contacts", tenantId] }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteContact(tenantId, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contacts", tenantId] }),
  });
  const bulkDeleteMut = useMutation({
    mutationFn: (ids: string[]) => deleteContactsBulk(tenantId, ids),
    onSuccess: () => {
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["contacts", tenantId] });
    },
  });

  const allSelected = contacts.length > 0 && selected.size === contacts.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(contacts.map((c) => c.id)));
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function startEdit(c: Contact) {
    setEditingId(c.id);
    setEditDraft({ first_name: c.first_name, last_name: c.last_name, phone: c.phone, email: c.email, company: c.company });
  }
  function saveEdit(id: string) {
    updateMut.mutate({ id, data: editDraft });
    setEditingId(null);
  }

  return (
    <DashboardShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-blue-700">CRM</p>
          <h2 className="text-2xl font-semibold tracking-tight">Contacts</h2>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <Button
              variant="outline"
              className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => {
                if (window.confirm(`Delete ${selected.size} selected contact(s)? This can't be undone.`)) {
                  bulkDeleteMut.mutate(Array.from(selected));
                }
              }}
              disabled={bulkDeleteMut.isPending}
            >
              <Trash2 className="w-4 h-4" /> Delete {selected.size} selected
            </Button>
          )}
          <Button onClick={() => setShowImport(true)} className="gap-1.5">
            <Upload className="w-4 h-4" /> Import CSV
          </Button>
        </div>
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
                  <th className="px-4 py-3 w-8">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                  </th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Added</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {contacts.map(c => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleOne(c.id)} />
                    </td>
                    {editingId === c.id ? (
                      <>
                        <td className="px-4 py-2 flex gap-1">
                          <Input className="h-8 text-xs w-20" value={editDraft.first_name ?? ""} placeholder="First"
                            onChange={(e) => setEditDraft((d) => ({ ...d, first_name: e.target.value }))} />
                          <Input className="h-8 text-xs w-20" value={editDraft.last_name ?? ""} placeholder="Last"
                            onChange={(e) => setEditDraft((d) => ({ ...d, last_name: e.target.value }))} />
                        </td>
                        <td className="px-4 py-2">
                          <Input className="h-8 text-xs" value={editDraft.phone ?? ""}
                            onChange={(e) => setEditDraft((d) => ({ ...d, phone: e.target.value }))} />
                        </td>
                        <td className="px-4 py-2">
                          <Input className="h-8 text-xs" value={editDraft.email ?? ""}
                            onChange={(e) => setEditDraft((d) => ({ ...d, email: e.target.value }))} />
                        </td>
                        <td className="px-4 py-2">
                          <Input className="h-8 text-xs" value={editDraft.company ?? ""}
                            onChange={(e) => setEditDraft((d) => ({ ...d, company: e.target.value }))} />
                        </td>
                        <td className="px-4 py-2.5 text-slate-400 text-xs">—</td>
                        <td className="px-4 py-2.5 text-xs text-slate-400">—</td>
                        <td className="px-4 py-2.5">
                          <div className="flex gap-1">
                            <button onClick={() => saveEdit(c.id)} className="p-1 rounded hover:bg-emerald-50 text-emerald-600">
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setEditingId(null)} className="p-1 rounded hover:bg-slate-100 text-slate-400">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
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
                        <td className="px-4 py-2.5">
                          <div className="flex gap-1">
                            <button onClick={() => startEdit(c)} className="p-1 rounded hover:bg-indigo-50 text-indigo-600" title="Edit">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => { if (window.confirm(`Delete ${c.first_name || c.phone}?`)) deleteMut.mutate(c.id); }}
                              className="p-1 rounded hover:bg-red-50 text-red-500" title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
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
