"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type Request = {
  id: string;
  email: string;
  display_name: string;
  requested_role: string;
  status: string;
  created_at: string;
};

const ROLES = ["agent", "manager", "tenant_admin", "super_admin"];
const ROLE_LABELS: Record<string, string> = {
  agent: "Client",
  manager: "Manager",
  tenant_admin: "Reseller",
  super_admin: "Superadmin",
};

export default function SuperadminApprovalsPage() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [processingId, setProcessingId] = useState<string | null>(null);

  async function getToken() {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? "";
  }

  async function fetchRequests() {
    setLoading(true);
    const token = await getToken();
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/admin/approvals?status_filter=${filter}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.ok) setRequests(await res.json());
    setLoading(false);
  }

  useEffect(() => { fetchRequests(); }, [filter]);

  async function approve(id: string, role: string) {
    setProcessingId(id);
    const token = await getToken();
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/approvals/${id}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    await fetchRequests();
    setProcessingId(null);
  }

  async function reject(id: string) {
    const reason = prompt("Reason for rejection (optional):");
    setProcessingId(id);
    const token = await getToken();
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/approvals/${id}/reject`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason ?? "" }),
    });
    await fetchRequests();
    setProcessingId(null);
  }

  return (
    <div className="p-6">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">User Approvals</h1>
          <p className="text-sm text-slate-500">Manage access requests from new users</p>
        </div>
        <div className="flex gap-2">
          {["pending", "approved", "rejected", "all"].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize ${
                filter === s
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-400">Loading...</div>
      ) : requests.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-slate-400">
          No {filter} requests
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600">User</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Requested</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Date</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                {filter === "pending" && (
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.map((req) => (
                <tr key={req.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{req.display_name || "—"}</div>
                    <div className="text-slate-400">{req.email}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {ROLE_LABELS[req.requested_role] ?? req.requested_role}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {new Date(req.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      req.status === "pending" ? "bg-yellow-100 text-yellow-700" :
                      req.status === "approved" ? "bg-green-100 text-green-700" :
                      "bg-red-100 text-red-700"
                    }`}>
                      {req.status}
                    </span>
                  </td>
                  {filter === "pending" && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <select
                          id={`role-${req.id}`}
                          defaultValue="agent"
                          className="rounded border border-slate-200 px-2 py-1 text-xs"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                        <button
                          disabled={processingId === req.id}
                          onClick={() => {
                            const sel = document.getElementById(`role-${req.id}`) as HTMLSelectElement;
                            approve(req.id, sel.value);
                          }}
                          className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          disabled={processingId === req.id}
                          onClick={() => reject(req.id)}
                          className="rounded bg-red-500 px-3 py-1 text-xs text-white hover:bg-red-600 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
