"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { Plus, X, Trash2, Users, Shield, User, AlertTriangle, ArrowLeft, KeyRound } from "lucide-react";
import Link from "next/link";

type UserRecord = {
  id: string;
  email: string;
  display_name: string;
  role: string;
  status: string;
  created_at: string;
  tenant_id: string;
  created_by: string;
};

const ROLE_CONFIG: Record<string, { label: string; color: string; bg: string; desc: string }> = {
  super_admin: { label: "Superadmin", color: "#6366f1", bg: "#eef2ff", desc: "Full platform access" },
  tenant_admin: { label: "Reseller", color: "#0ea5e9", bg: "#f0f9ff", desc: "Manages their own clients" },
  manager: { label: "Manager", color: "#f59e0b", bg: "#fffbeb", desc: "Manages team members" },
  agent: { label: "Client", color: "#10b981", bg: "#f0fdf4", desc: "Access to their own data" },
  viewer: { label: "Viewer", color: "#64748b", bg: "#f8fafc", desc: "Read-only access" },
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [filterRole, setFilterRole] = useState("all");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [currentRole, setCurrentRole] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", display_name: "", role: "agent", password: "" });

  async function getToken() {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? "";
  }

  async function fetchCurrentRole() {
    const token = await getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/approvals/me/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setCurrentRole(data.role ?? "");
    }
  }

  async function fetchUsers() {
    setLoading(true);
    const token = await getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    fetchCurrentRole();
    fetchUsers();
  }, []);

  async function handleCreate() {
    setCreating(true);
    setCreateError("");
    const token = await getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/users`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setShowCreate(false);
      setForm({ email: "", display_name: "", role: "agent", password: "" });
      fetchUsers();
    } else {
      const data = await res.json();
      setCreateError(data.detail ?? "Failed to create user");
    }
    setCreating(false);
  }

  async function handleDelete(userId: string) {
    const token = await getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/users/${userId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setDeleteConfirm(null);
      fetchUsers();
    }
  }

  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{ email: string; new_password: string } | null>(null);

  async function handleResetPassword(userId: string) {
    setResettingId(userId);
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/users/${userId}/reset-password`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setResetResult(data);
      }
    } finally {
      setResettingId(null);
    }
  }

  async function handleRoleChange(userId: string, newRole: string) {
    const token = await getToken();
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/users/${userId}/role`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    fetchUsers();
  }

  const isSuperAdmin = currentRole === "super_admin";
  const isReseller = currentRole === "tenant_admin";

  // Available roles for creation based on current user role
  const creatableRoles = isSuperAdmin
    ? ["tenant_admin", "manager", "agent", "viewer"]
    : ["agent"]; // Reseller can only create clients

  const filtered = filterRole === "all" ? users : users.filter(u => u.role === filterRole);

  const stats = {
    total: users.length,
    resellers: users.filter(u => u.role === "tenant_admin").length,
    clients: users.filter(u => u.role === "agent").length,
    pending: users.filter(u => u.status === "pending").length,
  };

  return (
    <div className="p-6 max-w-6xl mx-auto" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            {isSuperAdmin ? "User Management" : "My Clients"}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {isSuperAdmin ? "Create and manage all resellers and clients" : "Create and manage your client accounts"}
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all"
          style={{ background: "linear-gradient(135deg, #6366f1, #7c3aed)" }}>
          <Plus className="w-4 h-4" />
          {isSuperAdmin ? "Create User" : "Add Client"}
        </button>
      </div>

      {/* Stats - only for superadmin */}
      {isSuperAdmin && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total Users", value: stats.total, icon: Users, color: "#6366f1" },
            { label: "Resellers", value: stats.resellers, icon: Shield, color: "#0ea5e9" },
            { label: "Clients", value: stats.clients, icon: User, color: "#10b981" },
            { label: "Pending", value: stats.pending, icon: Users, color: "#f59e0b" },
          ].map(stat => (
            <div key={stat.label} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-500">{stat.label}</p>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${stat.color}15` }}>
                  <stat.icon className="w-4 h-4" style={{ color: stat.color }} />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-800 mt-1">{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setFilterRole("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${filterRole === "all" ? "text-white bg-indigo-600" : "bg-white border border-slate-200 text-slate-600"}`}>
          All Users
        </button>
        {isSuperAdmin && ["super_admin", "tenant_admin", "agent", "viewer"].map(role => (
          <button key={role} onClick={() => setFilterRole(role)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${filterRole === role ? "text-white" : "bg-white border border-slate-200 text-slate-600"}`}
            style={filterRole === role ? { background: ROLE_CONFIG[role]?.color } : {}}>
            {ROLE_CONFIG[role]?.label ?? role}
          </button>
        ))}
      </div>

      {/* Users table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-slate-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-400 text-sm">No users found</p>
            <button onClick={() => setShowCreate(true)} className="mt-3 text-sm text-indigo-600 font-medium">
              {isSuperAdmin ? "Create your first user" : "Add your first client"}
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">User</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Joined</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(u => {
                const roleConf = ROLE_CONFIG[u.role] ?? ROLE_CONFIG.viewer;
                const canDelete = isSuperAdmin || (isReseller && u.role === "agent");
                return (
                  <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                          style={{ background: roleConf.color }}>
                          {(u.display_name || u.email)[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">{u.display_name || "—"}</p>
                          <p className="text-xs text-slate-400">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {isSuperAdmin ? (
                        <select value={u.role} onChange={e => handleRoleChange(u.id, e.target.value)}
                          className="text-xs font-medium rounded-full px-2.5 py-1 border-0 outline-none cursor-pointer"
                          style={{ background: roleConf.bg, color: roleConf.color }}>
                          {Object.entries(ROLE_CONFIG).map(([r, c]) => (
                            <option key={r} value={r}>{c.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs font-medium rounded-full px-2.5 py-1"
                          style={{ background: roleConf.bg, color: roleConf.color }}>
                          {roleConf.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${
                        u.status === "approved" ? "bg-emerald-100 text-emerald-700" :
                        u.status === "pending" ? "bg-yellow-100 text-yellow-700" :
                        "bg-red-100 text-red-700"
                      }`}>{u.status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {new Date(u.created_at).toLocaleDateString("en-IN")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {isSuperAdmin && (
                          <button onClick={() => handleResetPassword(u.id)} disabled={resettingId === u.id}
                            className="flex items-center gap-1.5 text-xs text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 px-2 py-1 rounded transition-colors disabled:opacity-50">
                            <KeyRound className="w-3.5 h-3.5" /> {resettingId === u.id ? "Resetting…" : "Reset Password"}
                          </button>
                        )}
                        {canDelete && u.role !== "super_admin" && (
                          <button onClick={() => setDeleteConfirm(u.id)}
                            className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors">
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">Delete User</h3>
                <p className="text-xs text-slate-500">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-6">
              Are you sure you want to permanently delete this user? They will lose all access immediately.
            </p>
            <div className="flex gap-3">
              <button onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors">
                Delete User
              </button>
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Result Modal */}
      {resetResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                <KeyRound className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">Password Reset</h3>
                <p className="text-xs text-slate-500">{resetResult.email}</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-2">New temporary password — share this with them securely:</p>
            <div className="flex items-center gap-2 mb-6">
              <code className="flex-1 bg-slate-100 rounded-lg px-3 py-2 text-sm font-mono text-slate-800">
                {resetResult.new_password}
              </code>
              <button onClick={() => navigator.clipboard.writeText(resetResult.new_password)}
                className="text-xs px-2.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600">
                Copy
              </button>
            </div>
            <button onClick={() => setResetResult(null)}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors">
              Done
            </button>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-slate-800">
                  {isSuperAdmin ? "Create New User" : "Add New Client"}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">They&apos;ll receive an email to set their password</p>
              </div>
              <button onClick={() => setShowCreate(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Full Name</label>
                <input type="text" placeholder="John Doe" value={form.display_name}
                  onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email</label>
                <input type="email" placeholder="user@company.com" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Temporary Password</label>
                <input type="password" placeholder="Min. 8 characters" value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all" />
              </div>

              {/* Role selection — only show if more than one option */}
              {creatableRoles.length > 1 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Role</label>
                  <div className="grid grid-cols-2 gap-2">
                    {creatableRoles.map(role => {
                      const conf = ROLE_CONFIG[role];
                      return (
                        <button key={role} onClick={() => setForm(f => ({ ...f, role }))}
                          className={`p-3 rounded-lg border text-left transition-all ${form.role === role ? "border-indigo-300 shadow-sm" : "border-slate-200 hover:border-slate-300"}`}
                          style={form.role === role ? { background: conf.bg } : {}}>
                          <p className="text-xs font-semibold" style={{ color: form.role === role ? conf.color : "#475569" }}>{conf.label}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{conf.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Reseller info message */}
              {isReseller && (
                <div className="rounded-lg px-3.5 py-2.5 text-xs text-blue-700 bg-blue-50 border border-blue-100">
                  ℹ️ As a reseller, you can only create Client accounts.
                </div>
              )}

              {createError && (
                <div className="rounded-lg px-3.5 py-2.5 text-sm text-red-700 bg-red-50 border border-red-100">
                  {createError}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button onClick={handleCreate} disabled={!form.email || !form.password || creating}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #6366f1, #7c3aed)" }}>
                  {creating ? "Creating..." : isSuperAdmin ? "Create User" : "Add Client"}
                </button>
                <button onClick={() => setShowCreate(false)}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
