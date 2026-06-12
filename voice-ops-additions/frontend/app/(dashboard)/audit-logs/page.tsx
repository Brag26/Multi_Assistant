"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSessionStore } from "@/store/session";
import { listAuditLogs, type AuditLog } from "@/lib/api";
import { DashboardShell } from "@/components/dashboard/shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, ChevronDown, ChevronRight } from "lucide-react";

const RESOURCE_TYPES = ["workflow", "contact", "campaign", "call", "appointment", "integration", "notification"];

export default function AuditLogsPage() {
  const tenantId = useSessionStore(s => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const [resourceType, setResourceType] = useState<string | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: logs = [], isLoading } = useQuery<AuditLog[]>({
    queryKey: ["audit-logs", tenantId, resourceType],
    queryFn: () => listAuditLogs(tenantId, resourceType),
    enabled: Boolean(tenantId),
  });

  return (
    <DashboardShell>
      <div className="mb-6">
        <p className="text-sm font-medium text-blue-700">Compliance</p>
        <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Shield className="w-6 h-6" /> Audit Logs
        </h2>
      </div>

      <div className="flex gap-1.5 mb-4 flex-wrap">
        <Button size="sm" variant={!resourceType ? "default" : "ghost"}
          className="h-7 px-3 text-xs" onClick={() => setResourceType(undefined)}>
          All
        </Button>
        {RESOURCE_TYPES.map(t => (
          <Button key={t} size="sm" variant={resourceType === t ? "default" : "ghost"}
            className="h-7 px-3 text-xs capitalize" onClick={() => setResourceType(t === resourceType ? undefined : t)}>
            {t}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-400">
            <Shield className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No audit logs found</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-slate-500">
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Resource</th>
                  <th className="px-4 py-3 w-8" />
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <>
                    <tr key={log.id}
                      className="border-b last:border-0 hover:bg-slate-50 cursor-pointer"
                      onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}>
                      <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500">
                        {log.actor_user_id ? log.actor_user_id.slice(0, 8) + "…" : "system"}
                      </td>
                      <td className="px-4 py-2.5 font-medium">{log.action}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs bg-slate-100 px-1.5 py-0.5 rounded capitalize">
                          {log.resource_type}
                        </span>
                        {log.resource_id && (
                          <span className="ml-1.5 font-mono text-xs text-slate-400">
                            {log.resource_id.slice(0, 8)}…
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-400">
                        {expandedId === log.id
                          ? <ChevronDown className="w-3.5 h-3.5" />
                          : <ChevronRight className="w-3.5 h-3.5" />}
                      </td>
                    </tr>
                    {expandedId === log.id && (
                      <tr key={`${log.id}-detail`} className="bg-slate-50">
                        <td colSpan={5} className="px-4 py-3">
                          <pre className="text-xs font-mono text-slate-600 whitespace-pre-wrap bg-white border rounded p-2 max-h-32 overflow-y-auto">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </DashboardShell>
  );
}
