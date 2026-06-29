"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore } from "@/store/session";
import { createWorkflow } from "@/lib/api";
import { ArrowLeft, ArrowRight, Check, Zap, ChevronRight, Plus, X } from "lucide-react";

// ─── Wizard Steps ─────────────────────────────────────────────────────────────

const STEPS = [
  {
    id: "service",
    question: "What type of workflow is this?",
    subtitle: "Choose the category that best describes this workflow",
    options: [
      { id: "outbound_sales", label: "Outbound Sales", emoji: "📞", desc: "Cold or warm outbound calling campaigns" },
      { id: "lead_qualification", label: "Lead Qualification", emoji: "🎯", desc: "Qualify inbound or outbound leads" },
      { id: "appointment", label: "Appointment Reminder", emoji: "📅", desc: "Confirm and remind scheduled meetings" },
      { id: "follow_up", label: "Follow-Up Sequence", emoji: "🔁", desc: "Follow up after initial contact" },
      { id: "win_back", label: "Win-Back / Re-engagement", emoji: "🔄", desc: "Re-engage lost or inactive contacts" },
      { id: "survey", label: "Survey / Data Collection", emoji: "📋", desc: "Gather information from contacts" },
      { id: "onboarding", label: "Client Onboarding", emoji: "🤝", desc: "Welcome and onboard new clients" },
      { id: "custom", label: "General Purpose", emoji: "⚙️", desc: "Build a flexible custom workflow" },
    ],
  },
  {
    id: "trigger",
    question: "What starts this workflow?",
    subtitle: "Define the trigger that kicks off the first action",
    options: [
      { id: "manual", label: "Manual / Campaign Launch", emoji: "🚀", desc: "Started manually when you launch a campaign" },
      { id: "new_contact", label: "New Contact Added", emoji: "👤", desc: "Triggers when a new contact is imported or added" },
      { id: "webhook", label: "Incoming Webhook", emoji: "⚡", desc: "Triggered by external tools like Make, Zapier, n8n" },
      { id: "scheduled", label: "On a Schedule", emoji: "⏰", desc: "Runs automatically at set times (daily, weekly)" },
      { id: "call_outcome", label: "After a Call Outcome", emoji: "📱", desc: "Triggers based on previous call result" },
    ],
  },
  {
    id: "goal",
    question: "What is the main goal?",
    subtitle: "What outcome should this workflow achieve?",
    options: [
      { id: "book_meeting", label: "Book a Meeting", emoji: "📅", desc: "Schedule a call, demo, or appointment" },
      { id: "qualify", label: "Qualify the Lead", emoji: "✅", desc: "Score and route leads by interest level" },
      { id: "close_sale", label: "Close a Sale", emoji: "💰", desc: "Direct sales conversion on the call" },
      { id: "send_info", label: "Send Information", emoji: "📄", desc: "Share details, proposals, or resources" },
      { id: "collect_data", label: "Collect Data", emoji: "📊", desc: "Gather responses, feedback, or preferences" },
      { id: "confirm_action", label: "Confirm an Action", emoji: "☑️", desc: "Confirm attendance, delivery, or next steps" },
    ],
  },
  {
    id: "followup",
    question: "What happens if no response or not ready?",
    subtitle: "Choose your follow-up strategy for unresponsive contacts",
    options: [
      { id: "retry_same_day", label: "Retry same day", emoji: "⚡", desc: "Try again after a few hours" },
      { id: "retry_1d", label: "Retry after 1 day", emoji: "📱", desc: "Call again the next day automatically" },
      { id: "retry_3d", label: "Retry after 3 days", emoji: "📱", desc: "Wait 3 days then try again" },
      { id: "retry_1w", label: "Retry after 1 week", emoji: "📅", desc: "Give space and follow up weekly" },
      { id: "nurture", label: "Move to nurture", emoji: "💧", desc: "Add to a long-term follow-up sequence" },
      { id: "notify_team", label: "Notify team via webhook", emoji: "🔔", desc: "Alert your team via Make, Zapier, or Slack" },
      { id: "no_followup", label: "End workflow", emoji: "🚫", desc: "No follow-up, close the contact" },
    ],
  },
  {
    id: "name",
    question: "Name your workflow",
    subtitle: "Give it a clear name so your team knows what it does",
    isCustomInput: true,
  },
];

// ─── Workflow builder ─────────────────────────────────────────────────────────

function buildWorkflow(answers: Record<string, string>) {
  const { service, trigger, goal, followup, name } = answers;

  const nodes: Record<string, unknown>[] = [];
  const edges: Record<string, unknown>[] = [];
  let nodeCount = 0;

  // Y positions for left/right branches
  let mainY = 100;
  const leftX = 0;
  const mainX = 200;
  const rightX = 400;

  const addNode = (type: string, label: string, x: number, y: number, extra: Record<string, unknown> = {}) => {
    const id = `node_${++nodeCount}`;
    nodes.push({ id, type, position: { x, y }, data: { label, ...extra } });
    return id;
  };

  const addEdge = (source: string, target: string, label?: string) => {
    edges.push({ id: `e${edges.length + 1}`, source, target, ...(label ? { label } : {}) });
  };

  // Opening script based on service type
  const openingScripts: Record<string, string> = {
    outbound_sales: "Hi, this is [Agent Name] calling from [Company]. I'm reaching out because we help businesses like yours with [Value Proposition]. Do you have 2 minutes to chat?",
    lead_qualification: "Hi [Name], thanks for your interest in [Company]. I'm calling to learn more about your needs and see if we might be a good fit. Is now a good time?",
    appointment: "Hi [Name], I'm calling to confirm your upcoming appointment with [Company] scheduled for [Date/Time]. Are you still available?",
    follow_up: "Hi [Name], I'm following up from our previous conversation about [Topic]. I wanted to check in and see if you had any questions.",
    win_back: "Hi [Name], it's been a while! I'm reaching out from [Company] because we've made some significant improvements and wanted to reconnect with you.",
    survey: "Hi [Name], I'm calling from [Company] with a quick 2-minute survey about your experience. Your feedback helps us improve. Is now okay?",
    onboarding: "Hi [Name], welcome to [Company]! I'm calling to help you get started and make sure everything is set up for your success.",
    custom: "Hi, this is [Agent Name] calling from [Company]. I'm reaching out about [Purpose]. Do you have a moment to talk?",
  };

  // Trigger type mapping
  const triggerTypeMap: Record<string, string> = {
    manual: "campaign_start",
    new_contact: "incoming_make_webhook",
    webhook: "incoming_make_webhook",
    scheduled: "cron",
    call_outcome: "campaign_start",
  };

  // Step 1: Trigger
  const triggerId = addNode("trigger", getTriggerLabel(trigger), mainX, mainY, {
    trigger_type: triggerTypeMap[trigger] ?? "campaign_start",
  });
  mainY += 140;

  // Step 2: AI Call
  const callId = addNode("start_vapi_call", "AI Voice Call", mainX, mainY, {
    script: openingScripts[service] ?? openingScripts.custom,
  });
  addEdge(triggerId, callId);
  mainY += 140;

  // Step 3: Decision based on goal
  const decisionLabel = getDecisionLabel(goal);
  const decisionId = addNode("if_else", decisionLabel, mainX, mainY, {
    condition: getCondition(goal),
  });
  addEdge(callId, decisionId);
  mainY += 140;

  // Step 4: Success branch (right)
  const successId = addNode(...getSuccessNode(goal, rightX, mainY));
  addEdge(decisionId, successId, "Yes ✓");

  // Step 5: Follow-up branch (left)
  let followupEndId = "";
  if (followup === "no_followup") {
    followupEndId = addNode("stop_workflow", "End", leftX, mainY, {});
    addEdge(decisionId, followupEndId, "No ✗");
  } else if (followup.startsWith("retry")) {
    const duration = getRetryDuration(followup);
    const waitId = addNode("wait", `Wait ${duration}`, leftX, mainY, { duration });
    addEdge(decisionId, waitId, "No ✗");
    const retryId = addNode("start_vapi_call", "Follow-up Call", leftX, mainY + 140, {
      script: "Hi [Name], I'm following up from our earlier call. I wanted to check if you had a chance to think things over?",
    });
    addEdge(waitId, retryId);
    followupEndId = retryId;
  } else if (followup === "nurture") {
    followupEndId = addNode("action", "Add to Nurture Sequence", leftX, mainY, { action_type: "send_webhook" });
    addEdge(decisionId, followupEndId, "No ✗");
  } else if (followup === "notify_team") {
    followupEndId = addNode("action", "Notify Team via Webhook", leftX, mainY, { action_type: "send_webhook" });
    addEdge(decisionId, followupEndId, "No ✗");
  }

  // End node
  const endY = Math.max(mainY + 280, mainY + 140);
  const endId = addNode("stop_workflow", "End", mainX, endY, {});
  addEdge(successId, endId);
  if (followupEndId) addEdge(followupEndId, endId);

  return {
    name: name || getAutoName(service),
    nodes,
    edges,
  };
}

function getTriggerLabel(trigger: string) {
  const labels: Record<string, string> = {
    manual: "Campaign Start",
    new_contact: "New Contact Added",
    webhook: "Incoming Webhook",
    scheduled: "Scheduled Trigger",
    call_outcome: "Call Outcome Trigger",
  };
  return labels[trigger] ?? "Start";
}

function getDecisionLabel(goal: string) {
  const labels: Record<string, string> = {
    book_meeting: "Interested in meeting?",
    qualify: "Lead qualified?",
    close_sale: "Deal closed?",
    send_info: "Info requested?",
    collect_data: "Data collected?",
    confirm_action: "Confirmed?",
  };
  return labels[goal] ?? "Outcome check";
}

function getCondition(goal: string) {
  const conditions: Record<string, string> = {
    book_meeting: "outcome == qualified",
    qualify: "lead_score >= 60",
    close_sale: "outcome == converted",
    send_info: "outcome == qualified",
    collect_data: "outcome == completed",
    confirm_action: "outcome == confirmed",
  };
  return conditions[goal] ?? "outcome == qualified";
}

function getSuccessNode(goal: string, x: number, y: number): [string, string, number, number, Record<string, unknown>] {
  const successNodes: Record<string, [string, string, Record<string, unknown>]> = {
    book_meeting: ["action", "Book Appointment", { action_type: "book_appointment" }],
    qualify: ["action", "Route to Sales Team", { action_type: "send_webhook" }],
    close_sale: ["action", "Log Sale & Notify Team", { action_type: "send_webhook" }],
    send_info: ["action", "Send Information Package", { action_type: "send_webhook" }],
    collect_data: ["action", "Save Collected Data", { action_type: "send_webhook" }],
    confirm_action: ["action", "Confirm & Notify", { action_type: "send_webhook" }],
  };
  const [type, label, extra] = successNodes[goal] ?? ["action", "Complete Action", { action_type: "send_webhook" }];
  return [type, label, x, y, extra];
}

function getRetryDuration(followup: string) {
  const durations: Record<string, string> = {
    retry_same_day: "4h",
    retry_1d: "1d",
    retry_3d: "3d",
    retry_1w: "7d",
  };
  return durations[followup] ?? "1d";
}

function getAutoName(service: string) {
  const names: Record<string, string> = {
    outbound_sales: "Outbound Sales Workflow",
    lead_qualification: "Lead Qualification Workflow",
    appointment: "Appointment Reminder Workflow",
    follow_up: "Follow-Up Sequence",
    win_back: "Win-Back Campaign",
    survey: "Survey Workflow",
    onboarding: "Client Onboarding Workflow",
    custom: "Custom Workflow",
  };
  return names[service] ?? "New Workflow";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WorkflowWizardPage() {
  const router = useRouter();
  const tenantId = useSessionStore(s => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [customName, setCustomName] = useState("");
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState(false);

  const step = STEPS[currentStep];
  const isLastStep = currentStep === STEPS.length - 1;
  const currentAnswer = step.isCustomInput ? customName : answers[step.id];
  const canProceed = !!currentAnswer;

  const allAnswers = { ...answers, name: customName || getAutoName(answers.service ?? "") };
  const allAnswered = STEPS.slice(0, -1).every(s => answers[s.id]) && canProceed;

  function selectOption(stepId: string, optionId: string) {
    setAnswers(prev => ({ ...prev, [stepId]: optionId }));
    // Auto-advance after selection (except last step)
    if (currentStep < STEPS.length - 1) {
      setTimeout(() => setCurrentStep(c => c + 1), 300);
    }
  }

  function next() {
    if (currentStep < STEPS.length - 1) setCurrentStep(c => c + 1);
  }

  function back() {
    if (currentStep > 0) setCurrentStep(c => c - 1);
  }

  async function handleCreate() {
    if (!allAnswered) return;
    setCreating(true);
    try {
      const { name, nodes, edges } = buildWorkflow(allAnswers);
      const wf = await createWorkflow(tenantId, {
        name,
        description: `Auto-generated via Smart Wizard`,
        status: "draft" as const,
        trigger_type: (nodes[0] as { data: { trigger_type: string } }).data.trigger_type as never,
        nodes: nodes as never,
        edges: edges as never,
        config: { wizard_answers: allAnswers, auto_generated: true },
      });
      router.push(`/workflows?open=${wf.id}`);
    } catch {
      setCreating(false);
    }
  }

  const generatedWorkflow = allAnswered ? buildWorkflow(allAnswers) : null;

  const typeColors: Record<string, string> = {
    trigger: "#6366f1",
    start_vapi_call: "#10b981",
    if_else: "#f59e0b",
    action: "#0ea5e9",
    wait: "#8b5cf6",
    stop_workflow: "#64748b",
  };

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => router.push("/workflows")}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Workflows
          </button>
          <span className="text-slate-300">/</span>
          <span className="text-sm font-medium text-slate-700">Smart Wizard</span>
        </div>

        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-5 h-5 text-indigo-600" />
            <h1 className="text-2xl font-bold text-slate-800">Smart Workflow Wizard</h1>
          </div>
          <p className="text-slate-500">Answer 5 quick questions — we&apos;ll build your complete workflow automatically.</p>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2 flex-1">
              <button
                onClick={() => i <= currentStep && setCurrentStep(i)}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all shrink-0 ${
                  i < currentStep ? "bg-indigo-600 text-white cursor-pointer hover:bg-indigo-700" :
                  i === currentStep ? "bg-indigo-600 text-white ring-4 ring-indigo-100" :
                  "bg-slate-200 text-slate-400 cursor-default"
                }`}>
                {i < currentStep ? <Check className="w-4 h-4" /> : i + 1}
              </button>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-1 rounded-full transition-all ${i < currentStep ? "bg-indigo-600" : "bg-slate-200"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Question card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800 mb-1">{step.question}</h2>
          <p className="text-sm text-slate-500 mb-6">{step.subtitle}</p>

          {step.isCustomInput ? (
            <div className="space-y-3">
              <input
                type="text"
                placeholder="e.g. Q3 Outbound Sales Campaign"
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && canProceed && handleCreate()}
                className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all text-base"
                autoFocus
              />
              {!customName && answers.service && (
                <button
                  onClick={() => setCustomName(getAutoName(answers.service))}
                  className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
                  Use suggested: &ldquo;{getAutoName(answers.service)}&rdquo;
                </button>
              )}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {step.options?.map(option => {
                const selected = answers[step.id] === option.id;
                return (
                  <button key={option.id}
                    onClick={() => selectOption(step.id, option.id)}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${
                      selected
                        ? "border-indigo-500 bg-indigo-50 shadow-sm"
                        : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50"
                    }`}>
                    <div className="flex items-start gap-3">
                      <span className="text-2xl shrink-0">{option.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`font-semibold text-sm ${selected ? "text-indigo-700" : "text-slate-800"}`}>
                            {option.label}
                          </p>
                          {selected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{option.desc}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button onClick={back} disabled={currentStep === 0}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 transition-all">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>

          <div className="flex items-center gap-3">
            {allAnswered && (
              <button onClick={() => setPreview(!preview)}
                className="px-4 py-2.5 rounded-lg text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors">
                {preview ? "Hide" : "Preview"}
              </button>
            )}

            {isLastStep ? (
              <button onClick={handleCreate}
                disabled={!canProceed || creating}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #6366f1, #7c3aed)" }}>
                {creating ? "Building..." : "Build Workflow"}
                {!creating && <Zap className="w-4 h-4" />}
              </button>
            ) : (
              <button onClick={next}
                disabled={!canProceed}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #6366f1, #7c3aed)" }}>
                Next <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Answer summary pills */}
        {Object.keys(answers).length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {STEPS.filter(s => !s.isCustomInput && answers[s.id]).map(s => {
              const option = s.options?.find(o => o.id === answers[s.id]);
              return option ? (
                <span key={s.id}
                  className="flex items-center gap-1.5 text-xs bg-white border border-slate-200 rounded-full px-3 py-1 text-slate-600">
                  {option.emoji} {option.label}
                </span>
              ) : null;
            })}
            {customName && (
              <span className="flex items-center gap-1.5 text-xs bg-indigo-50 border border-indigo-200 rounded-full px-3 py-1 text-indigo-600">
                📝 {customName}
              </span>
            )}
          </div>
        )}

        {/* Workflow preview */}
        {preview && generatedWorkflow && (
          <div className="mt-6 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-indigo-600" />
                  {generatedWorkflow.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {generatedWorkflow.nodes.length} steps · {generatedWorkflow.edges.length} connections
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {generatedWorkflow.nodes.map((node, i) => {
                const n = node as { id: string; type: string; data: { label: string } };
                const color = typeColors[n.type] ?? "#64748b";
                return (
                  <div key={n.id} className="flex items-center gap-3 py-1">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                      style={{ background: color }}>
                      {i + 1}
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
                      style={{ background: `${color}15`, color }}>
                      {n.type.replace(/_/g, " ")}
                    </span>
                    <span className="text-sm text-slate-700">{n.data.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}