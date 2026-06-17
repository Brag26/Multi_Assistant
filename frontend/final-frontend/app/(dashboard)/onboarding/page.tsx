"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSessionStore } from "@/store/session";
import { configureSlack, getSlackConfig, getCalendarOAuthUrl } from "@/lib/api-features";
import { connectIntegration, listIntegrations } from "@/lib/api";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Phone, Webhook, Calendar, Bell, Zap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const STEPS = [
  { id: "vapi",     label: "Connect Vapi",        icon: Phone,    desc: "AI voice agent platform" },
  { id: "twilio",   label: "Connect Twilio",       icon: Phone,    desc: "Phone number & telephony" },
  { id: "make",     label: "Connect Make.com",     icon: Webhook,  desc: "Automation scenarios" },
  { id: "slack",    label: "Set up Slack alerts",  icon: Bell,     desc: "Real-time notifications" },
  { id: "calendar", label: "Connect Calendar",     icon: Calendar, desc: "Sync appointments" },
  { id: "workflow", label: "Create first workflow", icon: Zap,     desc: "Build your automation" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const tenantId = useSessionStore(s => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const [currentStep, setCurrentStep] = useState(0);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [vapiKey, setVapiKey] = useState("");
  const [twilioSid, setTwilioSid] = useState("");
  const [twilioToken, setTwilioToken] = useState("");
  const [twilioPhone, setTwilioPhone] = useState("");
  const [makeUrl, setMakeUrl] = useState("");
  const [slackUrl, setSlackUrl] = useState("");
  const [slackChannel, setSlackChannel] = useState("");
  const [saving, setSaving] = useState(false);

  const markDone = (id: string) => {
    setCompleted(prev => new Set([...prev, id]));
    if (currentStep < STEPS.length - 1) setCurrentStep(s => s + 1);
  };

  const handleVapi = async () => {
    setSaving(true);
    try {
      await connectIntegration(tenantId, "vapi", { api_key: vapiKey });
      markDone("vapi");
    } finally { setSaving(false); }
  };

  const handleTwilio = async () => {
    setSaving(true);
    try {
      await connectIntegration(tenantId, "twilio", {
        account_sid: twilioSid, auth_token: twilioToken, config: { phone: twilioPhone }
      });
      markDone("twilio");
    } finally { setSaving(false); }
  };

  const handleMake = async () => {
    setSaving(true);
    try {
      await connectIntegration(tenantId, "make", { webhook_url: makeUrl });
      markDone("make");
    } finally { setSaving(false); }
  };

  const handleSlack = async () => {
    setSaving(true);
    try {
      await configureSlack(tenantId, { webhook_url: slackUrl, channel: slackChannel });
      markDone("slack");
    } finally { setSaving(false); }
  };

  const handleCalendar = async () => {
    const redirectUri = `${window.location.origin}/integrations/calendar/callback`;
    const res = await getCalendarOAuthUrl(tenantId, redirectUri);
    window.location.href = res.url;
  };

  const stepContent: Record<string, React.ReactNode> = {
    vapi: (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">Paste your Vapi API key from <a href="https://app.vapi.ai" target="_blank" className="text-blue-600 underline">app.vapi.ai</a> → Account → API Keys</p>
        <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="vapi_..." value={vapiKey} onChange={e => setVapiKey(e.target.value)} />
        <div className="flex gap-2">
          <Button onClick={handleVapi} disabled={!vapiKey || saving} className="gap-1.5">
            {saving ? "Saving…" : "Connect Vapi"} <ArrowRight className="w-4 h-4" />
          </Button>
          <Button variant="ghost" onClick={() => markDone("vapi")}>Skip for now</Button>
        </div>
      </div>
    ),
    twilio: (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">From <a href="https://console.twilio.com" target="_blank" className="text-blue-600 underline">console.twilio.com</a> → Account Info</p>
        <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Account SID: ACxxxx..." value={twilioSid} onChange={e => setTwilioSid(e.target.value)} />
        <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Auth Token" type="password" value={twilioToken} onChange={e => setTwilioToken(e.target.value)} />
        <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Phone number: +15550001234" value={twilioPhone} onChange={e => setTwilioPhone(e.target.value)} />
        <div className="flex gap-2">
          <Button onClick={handleTwilio} disabled={!twilioSid || saving} className="gap-1.5">
            {saving ? "Saving…" : "Connect Twilio"} <ArrowRight className="w-4 h-4" />
          </Button>
          <Button variant="ghost" onClick={() => markDone("twilio")}>Skip</Button>
        </div>
      </div>
    ),
    make: (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">From <a href="https://make.com" target="_blank" className="text-blue-600 underline">make.com</a> → create a scenario → add Webhooks module → copy URL</p>
        <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="https://hook.make.com/..." value={makeUrl} onChange={e => setMakeUrl(e.target.value)} />
        <div className="flex gap-2">
          <Button onClick={handleMake} disabled={!makeUrl || saving} className="gap-1.5">
            {saving ? "Saving…" : "Connect Make.com"} <ArrowRight className="w-4 h-4" />
          </Button>
          <Button variant="ghost" onClick={() => markDone("make")}>Skip</Button>
        </div>
      </div>
    ),
    slack: (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">From your Slack workspace → Apps → Incoming Webhooks → Add New Webhook</p>
        <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="https://hooks.slack.com/services/..." value={slackUrl} onChange={e => setSlackUrl(e.target.value)} />
        <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Channel: #voice-ops (optional)" value={slackChannel} onChange={e => setSlackChannel(e.target.value)} />
        <div className="flex gap-2">
          <Button onClick={handleSlack} disabled={!slackUrl || saving} className="gap-1.5">
            {saving ? "Saving…" : "Connect Slack"} <ArrowRight className="w-4 h-4" />
          </Button>
          <Button variant="ghost" onClick={() => markDone("slack")}>Skip</Button>
        </div>
      </div>
    ),
    calendar: (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">Connect Google Calendar to automatically sync booked appointments.</p>
        <div className="flex gap-2">
          <Button onClick={handleCalendar} className="gap-1.5">
            <Calendar className="w-4 h-4" /> Connect Google Calendar
          </Button>
          <Button variant="ghost" onClick={() => markDone("calendar")}>Skip</Button>
        </div>
      </div>
    ),
    workflow: (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">You're all set! Create your first voice automation workflow.</p>
        <Button onClick={() => router.push("/workflows")} className="gap-1.5">
          <Zap className="w-4 h-4" /> Open Workflow Builder
        </Button>
      </div>
    ),
  };

  const allDone = completed.size >= STEPS.length - 1;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold">Welcome to VoiceOps</h1>
          <p className="text-slate-500 mt-1">Let's get your platform set up in a few steps</p>
        </div>

        <div className="grid gap-3">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            const done = completed.has(step.id);
            const active = currentStep === i;

            return (
              <Card key={step.id}
                className={`transition-all ${active ? "border-blue-400 shadow-sm" : done ? "opacity-70" : ""}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      done ? "bg-emerald-100" : active ? "bg-blue-100" : "bg-slate-100"
                    }`}>
                      {done
                        ? <Check className="w-4 h-4 text-emerald-600" />
                        : <Icon className={`w-4 h-4 ${active ? "text-blue-600" : "text-slate-400"}`} />
                      }
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className={`font-medium text-sm ${done ? "line-through text-slate-400" : ""}`}>{step.label}</p>
                          <p className="text-xs text-slate-400">{step.desc}</p>
                        </div>
                        {!active && !done && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs"
                            onClick={() => setCurrentStep(i)}>
                            Set up <ChevronRight className="w-3 h-3 ml-0.5" />
                          </Button>
                        )}
                      </div>
                      {active && (
                        <div className="mt-3">{stepContent[step.id]}</div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {allDone && (
          <div className="mt-6 text-center">
            <Button size="lg" onClick={() => router.push("/dashboard")} className="gap-2">
              Go to Dashboard <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
