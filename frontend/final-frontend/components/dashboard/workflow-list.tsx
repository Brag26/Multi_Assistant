"use client";

import { useQuery } from "@tanstack/react-query";
import { PhoneCall } from "lucide-react";
import { listWorkflows } from "@/lib/api";
import { useSessionStore } from "@/store/session";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function WorkflowList() {
  const tenantId = useSessionStore((state) => state.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const { data, isLoading, error } = useQuery({
    queryKey: ["workflows", tenantId],
    queryFn: () => listWorkflows(tenantId),
    enabled: Boolean(tenantId)
  });

  if (!tenantId) return <EmptyState title="No tenant selected" description="Set NEXT_PUBLIC_DEMO_TENANT_ID locally or sign in with a tenant claim." />;
  if (isLoading) return <EmptyState title="Loading workflows" description="Fetching active voice operations." />;
  if (error) return <EmptyState title="Unable to load workflows" description="Check API connectivity and Supabase JWT claims." />;
  if (!data?.length) return <EmptyState title="No workflows yet" description="Create workflows through the API or seed them from Supabase." />;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {data.map((workflow) => (
        <Card key={workflow.id}>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold">{workflow.name}</h3>
              <p className="mt-1 text-sm text-slate-600">{workflow.description ?? "No description"}</p>
            </div>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{workflow.status}</span>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <div><dt className="text-slate-500">Vapi</dt><dd className="truncate font-medium">{workflow.vapi_assistant_id ?? "Not set"}</dd></div>
              <div><dt className="text-slate-500">Twilio</dt><dd className="truncate font-medium">{workflow.twilio_phone_number ?? "Not set"}</dd></div>
              <div><dt className="text-slate-500">Make.com</dt><dd className="truncate font-medium">{workflow.make_webhook_url ? "Connected" : "Not set"}</dd></div>
            </dl>
            <Button className="gap-2"><PhoneCall className="h-4 w-4" />Launch call</Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardContent className="py-10 text-center">
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </CardContent>
    </Card>
  );
}
