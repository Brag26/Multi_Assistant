"use client";
// app/(dashboard)/notifications/page.tsx
import { useSessionStore } from "@/store/session";
import { DashboardShell } from "@/components/dashboard/shell";
import { NotificationCenter } from "@/components/dashboard/NotificationCenter";

export default function NotificationsPage() {
  const tenantId = useSessionStore(s => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  return (
    <DashboardShell>
      <div className="max-w-2xl">
        <NotificationCenter tenantId={tenantId} />
      </div>
    </DashboardShell>
  );
}
