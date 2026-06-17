"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSessionStore } from "@/store/session";
import { listIntegrations, connectIntegration, type Integration } from "@/lib/api";
import { getSlackConfig, configureSlack, testSlack, disconnectSlack, getCalendarConfig, getCalendarOAuthUrl, disconnectCalendar } from "@/lib/api-features";
import { DashboardShell } from "@/components/dashboard/shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Phone, Webhook, MessageSquare, Calendar, CheckCircle, XCircle, Send } from "lucide-react";

export default function IntegrationsPage() {
  const tenantId = useSessionStore(s => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const queryClient = useQueryClient();

  const { data: integrations = [] } = useQuery<Integration[]>({
    queryKey: ["integrations", tenantId],
    queryFn: () => listIntegrations(tenantId),
    enabled: Boolean(tenantId),
  });

  const { data: slackConfig } = useQuery({
    queryKey: ["slack-config", tenantId],
    queryFn: () => getSlackConfig(tenantId),
    enabled: Boolean(tenantId),
  });

  const { data: calendarConfig } = useQuery({
    queryKey: ["calendar-config", tenantId],
    queryFn: () => getCalendarConfig(tenantId),
    enabled: Boolean(tenantId),
  });

  const vapi = integrations.find(i => i.provider === "vapi");
  const twilio = integrations.find(i => i.provider === "twilio");
  const make = integrations.find(i => i.provider === "make");

  return (
    <DashboardShell>
      <div className="mb-6">
        <p className="text-sm font-medium text-blue-700">Setup</p>
        <h2 className="text-2xl font-semibold tracking-tight">Integrations</h2>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <IntegrationCard
          icon={<Phone className="w-5 h-5 text-blue-600" />}
          title="Vapi"
          description="AI voice agent platform"
          connected={Boolean(vapi?.connected_at)}
        />
        <IntegrationCard
          icon={<Phone className="w-5 h-5 text-red-500" />}
          title="Twilio"
          description="Phone numbers & telephony"
          connected={Boolean(twilio?.connected_at)}
        />
        <IntegrationCard
          icon={<Webhook className="w-5 h-5 text-orange-500" />}
          title="Make.com"
          description="Automation scenarios"
          connected={Boolean(make?.connected_at)}
        />
        <SlackIntegrationCard tenantId={tenantId} config={slackConfig} />
        <CalendarIntegrationCard tenantId={tenantId} config={calendarConfig} />
      </div>
    </DashboardShell>
  );
}

function IntegrationCard({ icon, title, description, connected }: {
  icon: React.ReactNode; title: string; description: string; connected: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center">{icon}</div>
          <div>
            <p className="font-medium text-sm">{title}</p>
            <p className="text-xs text-slate-400">{description}</p>
          </div>
        </div>
        {connected ? (
          <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
            <CheckCircle className="w-3.5 h-3.5" /> Connected
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <XCircle className="w-3.5 h-3.5" /> Not connected
          </span>
        )}
      </CardContent>
    </Card>
  );
}

function SlackIntegrationCard({ tenantId, config }: { tenantId: string; config?: { connected: boolean; channel?: string } }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState("");
  const [channel, setChannel] = useState("");

  const connectMut = useMutation({
    mutationFn: () => configureSlack(tenantId, { webhook_url: url, channel }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["slack-config", tenantId] }); setShowForm(false); },
  });
  const testMut = useMutation({ mutationFn: () => testSlack(tenantId) });
  const disconnectMut = useMutation({
    mutationFn: () => disconnectSlack(tenantId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["slack-config", tenantId] }),
  });

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="font-medium text-sm">Slack</p>
              <p className="text-xs text-slate-400">{config?.channel ? `#${config.channel}` : "Notification alerts"}</p>
            </div>
          </div>
          {config?.connected ? (
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-xs" onClick={() => testMut.mutate()}>
                <Send className="w-3 h-3" /> Test
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-red-400" onClick={() => disconnectMut.mutate()}>
                Disconnect
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={() => setShowForm(true)}>Connect</Button>
          )}
        </div>

        {showForm && (
          <div className="mt-3 space-y-2 pt-3 border-t">
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="https://hooks.slack.com/services/..." value={url} onChange={e => setUrl(e.target.value)} />
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Channel (optional): voice-ops" value={channel} onChange={e => setChannel(e.target.value)} />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => connectMut.mutate()} disabled={!url || connectMut.isPending}>
                {connectMut.isPending ? "Connecting…" : "Save"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CalendarIntegrationCard({ tenantId, config }: { tenantId: string; config?: { connected: boolean; provider?: string } }) {
  const queryClient = useQueryClient();

  const connectMut = useMutation({
    mutationFn: async () => {
      const redirectUri = `${window.location.origin}/integrations/calendar/callback`;
      const res = await getCalendarOAuthUrl(tenantId, redirectUri);
      window.location.href = res.url;
    },
  });

  const disconnectMut = useMutation({
    mutationFn: () => disconnectCalendar(tenantId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calendar-config", tenantId] }),
  });

  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center">
            <Calendar className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="font-medium text-sm">Google Calendar</p>
            <p className="text-xs text-slate-400">Sync booked appointments</p>
          </div>
        </div>
        {config?.connected ? (
          <Button size="sm" variant="ghost" className="text-red-400" onClick={() => disconnectMut.mutate()}>
            Disconnect
          </Button>
        ) : (
          <Button size="sm" onClick={() => connectMut.mutate()} disabled={connectMut.isPending}>
            Connect
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
