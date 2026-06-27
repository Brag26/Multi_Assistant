"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore } from "@/store/session";
import { createWorkflow } from "@/lib/api";
import { ArrowLeft, ArrowRight, Check, Zap, Users, Megaphone, Globe, Phone, Calendar, RefreshCw } from "lucide-react";

// ─── Workflow Templates ───────────────────────────────────────────────────────

const TEMPLATES = [
  {
    id: "influencer_outreach",
    name: "Influencer Outreach",
    category: "Outreach",
    emoji: "⭐",
    color: "#8b5cf6",
    desc: "AI agent reaches out to influencers, qualifies interest, books discovery calls.",
    useCases: ["Brand partnerships", "Content collaborations", "Sponsored campaigns"],
    nodes: [
      { id: "trigger", type: "trigger", position: { x: 100, y: 100 }, data: { label: "Campaign Start", trigger_type: "campaign_start" } },
      { id: "call", type: "start_vapi_call", position: { x: 100, y: 220 }, data: { label: "AI Outbound Call", script: "Hi! I'm calling from [Brand]. We love your content and want to explore a partnership..." } },
      { id: "qualify", type: "if_else", position: { x: 100, y: 340 }, data: { label: "Interested?", condition: "outcome == qualified" } },
      { id: "book", type: "action", position: { x: 250, y: 460 }, data: { label: "Book Discovery Call", action_type: "book_appointment" } },
      { id: "followup", type: "action", position: { x: -50, y: 460 }, data: { label: "Send Follow-up", action_type: "send_webhook" } },
      { id: "retry", type: "wait", position: { x: -50, y: 580 }, data: { label: "Wait 2 Days", duration: "2d" } },
      { id: "end", type: "stop_workflow", position: { x: 100, y: 700 }, data: { label: "End" } },
    ],
    edges: [
      { id: "e1", source: "trigger", target: "call" },
      { id: "e2", source: "call", target: "qualify" },
      { id: "e3", source: "qualify", target: "book", label: "Yes" },
      { id: "e4", source: "qualify", target: "followup", label: "No" },
      { id: "e5", source: "followup", target: "retry" },
      { id: "e6", source: "retry", target: "end" },
      { id: "e7", source: "book", target: "end" },
    ],
  },
  {
    id: "programmatic_outreach",
    name: "Programmatic Advertising",
    category: "Sales",
    emoji: "📊",
    color: "#0ea5e9",
    desc: "Reach media buyers and programmatic teams, qualify budget and intent, schedule demos.",
    useCases: ["DSP/SSP partnerships", "Media buying", "Ad tech sales"],
    nodes: [
      { id: "trigger", type: "trigger", position: { x: 100, y: 100 }, data: { label: "Campaign Start", trigger_type: "campaign_start" } },
      { id: "call", type: "start_vapi_call", position: { x: 100, y: 220 }, data: { label: "AI Outbound Call", script: "Hi, I'm calling from [Company]. We work with media buyers on programmatic solutions..." } },
      { id: "qualify", type: "if_else", position: { x: 100, y: 340 }, data: { label: "Budget Qualified?", condition: "outcome == qualified" } },
      { id: "demo", type: "action", position: { x: 250, y: 460 }, data: { label: "Schedule Demo", action_type: "book_appointment" } },
      { id: "nurture", type: "action", position: { x: -50, y: 460 }, data: { label: "Add to Nurture", action_type: "send_webhook" } },
      { id: "wait", type: "wait", position: { x: -50, y: 580 }, data: { label: "Wait 3 Days", duration: "3d" } },
      { id: "retry_call", type: "start_vapi_call", position: { x: -50, y: 700 }, data: { label: "Follow-up Call", script: "Hi, following up from our earlier conversation..." } },
      { id: "end", type: "stop_workflow", position: { x: 100, y: 820 }, data: { label: "End" } },
    ],
    edges: [
      { id: "e1", source: "trigger", target: "call" },
      { id: "e2", source: "call", target: "qualify" },
      { id: "e3", source: "qualify", target: "demo", label: "Qualified" },
      { id: "e4", source: "qualify", target: "nurture", label: "Not yet" },
      { id: "e5", source: "nurture", target: "wait" },
      { id: "e6", source: "wait", target: "retry_call" },
      { id: "e7", source: "retry_call", target: "end" },
      { id: "e8", source: "demo", target: "end" },
    ],
  },
  {
    id: "publisher_outreach",
    name: "Publisher Outreach",
    category: "Outreach",
    emoji: "📰",
    color: "#10b981",
    desc: "Connect with publishers and content platforms, explore inventory and monetization deals.",
    useCases: ["Inventory partnerships", "Content syndication", "Revenue share deals"],
    nodes: [
      { id: "trigger", type: "trigger", position: { x: 100, y: 100 }, data: { label: "Campaign Start", trigger_type: "campaign_start" } },
      { id: "call", type: "start_vapi_call", position: { x: 100, y: 220 }, data: { label: "AI Outbound Call", script: "Hi, I'm reaching out from [Company] about a potential publisher partnership..." } },
      { id: "qualify", type: "if_else", position: { x: 100, y: 340 }, data: { label: "Has Inventory?", condition: "outcome == qualified" } },
      { id: "proposal", type: "action", position: { x: 250, y: 460 }, data: { label: "Send Proposal", action_type: "send_webhook" } },
      { id: "book", type: "action", position: { x: 250, y: 580 }, data: { label: "Book Meeting", action_type: "book_appointment" } },
      { id: "dnc", type: "action", position: { x: -50, y: 460 }, data: { label: "Add to DNC", action_type: "add_dnc" } },
      { id: "end", type: "stop_workflow", position: { x: 100, y: 700 }, data: { label: "End" } },
    ],
    edges: [
      { id: "e1", source: "trigger", target: "call" },
      { id: "e2", source: "call", target: "qualify" },
      { id: "e3", source: "qualify", target: "proposal", label: "Yes" },
      { id: "e4", source: "qualify", target: "dnc", label: "No" },
      { id: "e5", source: "proposal", target: "book" },
      { id: "e6", source: "book", target: "end" },
      { id: "e7", source: "dnc", target: "end" },
    ],
  },
  {
    id: "lead_qualification",
    name: "Inbound Lead Qualification",
    category: "CRM",
    emoji: "🎯",
    color: "#f59e0b",
    desc: "Instantly call new inbound leads, qualify BANT criteria, route to the right team.",
    useCases: ["Website leads", "Form submissions", "Ad campaign leads"],
    nodes: [
      { id: "trigger", type: "trigger", position: { x: 100, y: 100 }, data: { label: "New Lead", trigger_type: "incoming_make_webhook" } },
      { id: "call", type: "start_vapi_call", position: { x: 100, y: 220 }, data: { label: "Instant AI Call", script: "Hi! Thanks for your interest in [Company]. I'm calling to learn more about your needs..." } },
      { id: "bant", type: "if_else", position: { x: 100, y: 340 }, data: { label: "BANT Qualified?", condition: "lead_score >= 70" } },
      { id: "hot", type: "action", position: { x: 250, y: 460 }, data: { label: "Route to Sales", action_type: "send_webhook" } },
      { id: "warm", type: "action", position: { x: -50, y: 460 }, data: { label: "Add to Nurture", action_type: "send_webhook" } },
      { id: "appt", type: "action", position: { x: 250, y: 580 }, data: { label: "Book Demo", action_type: "book_appointment" } },
      { id: "end", type: "stop_workflow", position: { x: 100, y: 700 }, data: { label: "End" } },
    ],
    edges: [
      { id: "e1", source: "trigger", target: "call" },
      { id: "e2", source: "call", target: "bant" },
      { id: "e3", source: "bant", target: "hot", label: "Qualified" },
      { id: "e4", source: "bant", target: "warm", label: "Not qualified" },
      { id: "e5", source: "hot", target: "appt" },
      { id: "e6", source: "appt", target: "end" },
      { id: "e7", source: "warm", target: "end" },
    ],
  },
  {
    id: "appointment_reminder",
    name: "Appointment Reminder",
    category: "Operations",
    emoji: "📅",
    color: "#ec4899",
    desc: "Auto-call leads 24h and 1h before appointments to confirm and reduce no-shows.",
    useCases: ["Demo reminders", "Meeting confirmations", "Event follow-ups"],
    nodes: [
      { id: "trigger", type: "trigger", position: { x: 100, y: 100 }, data: { label: "Appointment Booked", trigger_type: "appointment_created" } },
      { id: "wait_24h", type: "wait", position: { x: 100, y: 220 }, data: { label: "Wait until 24h before", duration: "24h_before" } },
      { id: "reminder1", type: "start_vapi_call", position: { x: 100, y: 340 }, data: { label: "24h Reminder Call", script: "Hi! Just a reminder about your appointment tomorrow at [time]..." } },
      { id: "confirm", type: "if_else", position: { x: 100, y: 460 }, data: { label: "Confirmed?", condition: "outcome == confirmed" } },
      { id: "wait_1h", type: "wait", position: { x: 250, y: 580 }, data: { label: "Wait until 1h before", duration: "1h_before" } },
      { id: "reminder2", type: "start_vapi_call", position: { x: 250, y: 700 }, data: { label: "1h Reminder Call", script: "Hi! Your appointment is in 1 hour..." } },
      { id: "reschedule", type: "action", position: { x: -50, y: 580 }, data: { label: "Offer Reschedule", action_type: "send_webhook" } },
      { id: "end", type: "stop_workflow", position: { x: 100, y: 820 }, data: { label: "End" } },
    ],
    edges: [
      { id: "e1", source: "trigger", target: "wait_24h" },
      { id: "e2", source: "wait_24h", target: "reminder1" },
      { id: "e3", source: "reminder1", target: "confirm" },
      { id: "e4", source: "confirm", target: "wait_1h", label: "Yes" },
      { id: "e5", source: "confirm", target: "reschedule", label: "No" },
      { id: "e6", source: "wait_1h", target: "reminder2" },
      { id: "e7", source: "reminder2", target: "end" },
      { id: "e8", source: "reschedule", target: "end" },
    ],
  },
  {
    id: "win_back",
    name: "Win-Back Campaign",
    category: "Retention",
    emoji: "🔄",
    color: "#6366f1",
    desc: "Re-engage lost leads or churned clients with AI outreach and special offers.",
    useCases: ["Lost deal recovery", "Churn prevention", "Reactivation campaigns"],
    nodes: [
      { id: "trigger", type: "trigger", position: { x: 100, y: 100 }, data: { label: "Lead Lost / Churned", trigger_type: "incoming_make_webhook" } },
      { id: "wait", type: "wait", position: { x: 100, y: 220 }, data: { label: "Wait 30 Days", duration: "30d" } },
      { id: "call", type: "start_vapi_call", position: { x: 100, y: 340 }, data: { label: "Win-Back Call", script: "Hi! It's been a while. We've made some exciting improvements and wanted to reconnect..." } },
      { id: "interest", type: "if_else", position: { x: 100, y: 460 }, data: { label: "Interested Again?", condition: "outcome == qualified" } },
      { id: "offer", type: "action", position: { x: 250, y: 580 }, data: { label: "Send Special Offer", action_type: "send_webhook" } },
      { id: "book", type: "action", position: { x: 250, y: 700 }, data: { label: "Book Call", action_type: "book_appointment" } },
      { id: "archive", type: "action", position: { x: -50, y: 580 }, data: { label: "Archive Contact", action_type: "update_contact" } },
      { id: "end", type: "stop_workflow", position: { x: 100, y: 820 }, data: { label: "End" } },
    ],
    edges: [
      { id: "e1", source: "trigger", target: "wait" },
      { id: "e2", source: "wait", target: "call" },
      { id: "e3", source: "call", target: "interest" },
      { id: "e4", source: "interest", target: "offer", label: "Yes" },
      { id: "e5", source: "interest", target: "archive", label: "No" },
      { id: "e6", source: "offer", target: "book" },
      { id: "e7", source: "book", target: "end" },
      { id: "e8", source: "archive", target: "end" },
    ],
  },
];

const CATEGORY_COLORS: Record<string, string> = {
  Outreach: "#8b5cf6",
  Sales: "#0ea5e9",
  CRM: "#f59e0b",
  Operations: "#ec4899",
  Retention: "#6366f1",
};

export default function WorkflowTemplatesPage() {
  const router = useRouter();
  const tenantId = useSessionStore(s => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState("All");

  const categories = ["All", ...Array.from(new Set(TEMPLATES.map(t => t.category)))];
  const filtered = filter === "All" ? TEMPLATES : TEMPLATES.filter(t => t.category === filter);
  const selectedTemplate = TEMPLATES.find(t => t.id === selected);

  async function handleUseTemplate() {
    if (!selectedTemplate || !tenantId) return;
    setCreating(true);
    try {
      const wf = await createWorkflow(tenantId, {
        name: selectedTemplate.name,
        description: selectedTemplate.desc,
        status: "draft" as const,
        trigger_type: selectedTemplate.nodes[0]?.data?.trigger_type ?? "campaign_start",
        nodes: selectedTemplate.nodes as never,
        edges: selectedTemplate.edges as never,
        config: { template_id: selectedTemplate.id },
      });
      router.push(`/workflows?open=${wf.id}`);
    } catch {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => router.push("/workflows")}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Workflows
          </button>
          <span className="text-slate-300">/</span>
          <span className="text-sm font-medium text-slate-700">Templates</span>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-800">Workflow Templates</h1>
          <p className="mt-1 text-slate-500">Start with a pre-built template and customize for your service.</p>
        </div>

        {/* Category filter */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {categories.map(cat => (
            <button key={cat} onClick={() => setFilter(cat)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                filter === cat
                  ? "text-white shadow-sm"
                  : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
              style={filter === cat ? { background: cat === "All" ? "#6366f1" : CATEGORY_COLORS[cat] } : {}}>
              {cat}
            </button>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          {/* Template list */}
          <div className="lg:col-span-2 grid sm:grid-cols-2 gap-3 content-start">
            {filtered.map(template => (
              <button key={template.id}
                onClick={() => setSelected(template.id)}
                className={`text-left p-4 rounded-xl border transition-all ${
                  selected === template.id
                    ? "border-indigo-400 shadow-md"
                    : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm"
                }`}
                style={selected === template.id ? { background: `${template.color}08` } : {}}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0"
                    style={{ background: `${template.color}15` }}>
                    {template.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm text-slate-800">{template.name}</p>
                      {selected === template.id && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                    </div>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full mt-1 inline-block"
                      style={{ background: `${CATEGORY_COLORS[template.category]}15`, color: CATEGORY_COLORS[template.category] }}>
                      {template.category}
                    </span>
                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{template.desc}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Preview panel */}
          <div className="lg:col-span-1">
            <div className="sticky top-4">
              {selectedTemplate ? (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-100"
                    style={{ background: `${selectedTemplate.color}08` }}>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{selectedTemplate.emoji}</span>
                      <div>
                        <h3 className="font-bold text-slate-800">{selectedTemplate.name}</h3>
                        <span className="text-xs font-medium" style={{ color: selectedTemplate.color }}>
                          {selectedTemplate.category}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 space-y-4">
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Use Cases</p>
                      <div className="space-y-1">
                        {selectedTemplate.useCases.map(uc => (
                          <div key={uc} className="flex items-center gap-2 text-xs text-slate-600">
                            <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                            {uc}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Workflow Steps</p>
                      <div className="space-y-1.5">
                        {selectedTemplate.nodes.map((node, i) => (
                          <div key={node.id} className="flex items-center gap-2 text-xs text-slate-600">
                            <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                              style={{ background: selectedTemplate.color }}>
                              {i + 1}
                            </span>
                            {node.data.label}
                          </div>
                        ))}
                      </div>
                    </div>
                    <button onClick={handleUseTemplate} disabled={creating}
                      className="w-full py-2.5 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                      style={{ background: selectedTemplate.color }}>
                      {creating ? "Creating..." : "Use this template"}
                      {!creating && <ArrowRight className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-dashed border-slate-200 p-8 text-center">
                  <Zap className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-400">Select a template to preview</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}