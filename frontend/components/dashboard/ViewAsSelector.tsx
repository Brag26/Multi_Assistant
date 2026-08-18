"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Eye } from "lucide-react";
import { useSessionStore } from "@/store/session";
import { adminListAccounts, type AdminAccount } from "@/lib/api-billing";

/**
 * Lets superadmin explicitly pick one account to view, instead of screens
 * either showing everything merged together or being silently scoped to
 * superadmin's own data. Only renders for superadmin — resellers/clients
 * don't get this, they only ever see their own scope.
 */
export function ViewAsSelector() {
  const role = useSessionStore((s) => s.role);
  const viewAsUserId = useSessionStore((s) => s.viewAsUserId);
  const viewAsLabel = useSessionStore((s) => s.viewAsLabel);
  const setViewAs = useSessionStore((s) => s.setViewAs);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (role !== "super_admin") return;
    adminListAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, [role]);

  if (role !== "super_admin") return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
      >
        <Eye className="w-4 h-4 text-indigo-600" />
        <span className="max-w-[160px] truncate">
          {viewAsUserId ? `Viewing: ${viewAsLabel}` : "My Own View"}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-64 max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg z-20">
            <button
              onClick={() => { setViewAs(null, null); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${!viewAsUserId ? "font-semibold text-indigo-600" : "text-slate-700"}`}
            >
              My Own View
            </button>
            <div className="border-t border-slate-100" />
            {accounts.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-400">No accounts yet.</p>
            ) : (
              accounts.map((a) => (
                <button
                  key={a.user_id}
                  onClick={() => {
                    setViewAs(a.user_id, a.display_name || a.email);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${viewAsUserId === a.user_id ? "font-semibold text-indigo-600" : "text-slate-700"}`}
                >
                  {a.display_name || a.email}
                  <span className="ml-1.5 text-xs text-slate-400">
                    {a.role === "tenant_admin" ? "Reseller" : "Client"}
                  </span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
