"use client";

/**
 * WorkflowBuilder — n8n-style visual workflow editor.
 *
 * Uses a pure React + SVG canvas (no external graph library dependency).
 * Nodes are draggable, edges are drawn as SVG curves.
 * The component is self-contained so it can be dropped into any page.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as RMouseEvent,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Plus, Play, Pause, Copy, Download, Upload,
  Save, RotateCcw, Trash2, X, Zap, GitBranch,
  Clock, Webhook, Mail, PhoneCall, UserCheck,
  ArrowRightLeft, StickyNote, RefreshCw, StopCircle,
  Shuffle, Merge, GitMerge, Check,
} from "lucide-react";
import type {
  Workflow, WorkflowNode, WorkflowEdge,
  WorkflowNodeData, WorkflowTriggerType, WorkflowActionType, WorkflowLogicType,
} from "@/lib/api";

// ─── Node palette definition ─────────────────────────────────────────────────

const TRIGGER_NODES: Array<{ type: WorkflowTriggerType; label: string; icon: React.ReactNode; color: string }> = [
  { type: "campaign_started",      label: "Campaign Started",      icon: <Play className="w-3.5 h-3.5" />,            color: "#6366f1" },
  { type: "campaign_completed",    label: "Campaign Completed",    icon: <Check className="w-3.5 h-3.5" />,           color: "#6366f1" },
  { type: "call_started",          label: "Call Started",          icon: <PhoneCall className="w-3.5 h-3.5" />,       color: "#8b5cf6" },
  { type: "call_answered",         label: "Call Answered",         icon: <PhoneCall className="w-3.5 h-3.5" />,       color: "#8b5cf6" },
  { type: "call_completed",        label: "Call Completed",        icon: <PhoneCall className="w-3.5 h-3.5" />,       color: "#8b5cf6" },
  { type: "call_failed",           label: "Call Failed",           icon: <PhoneCall className="w-3.5 h-3.5" />,       color: "#ef4444" },
  { type: "lead_qualified",        label: "Lead Qualified",        icon: <UserCheck className="w-3.5 h-3.5" />,       color: "#10b981" },
  { type: "intent_detected",       label: "Intent Detected",       icon: <Zap className="w-3.5 h-3.5" />,             color: "#f59e0b" },
  { type: "appointment_booked",    label: "Appointment Booked",    icon: <Clock className="w-3.5 h-3.5" />,           color: "#10b981" },
  { type: "incoming_make_webhook", label: "Make.com Webhook",      icon: <Webhook className="w-3.5 h-3.5" />,         color: "#f97316" },
  { type: "cron",                  label: "Scheduled (Cron)",      icon: <Clock className="w-3.5 h-3.5" />,           color: "#64748b" },
];

const ACTION_NODES: Array<{ type: WorkflowActionType; label: string; icon: React.ReactNode; color: string }> = [
  { type: "start_vapi_call",          label: "Start Vapi Call",           icon: <PhoneCall className="w-3.5 h-3.5" />,       color: "#3b82f6" },
  { type: "end_call",                 label: "End Call",                  icon: <PhoneCall className="w-3.5 h-3.5" />,       color: "#ef4444" },
  { type: "transfer_call",            label: "Transfer Call",             icon: <ArrowRightLeft className="w-3.5 h-3.5" />,  color: "#3b82f6" },
  { type: "update_contact",           label: "Update Contact",            icon: <UserCheck className="w-3.5 h-3.5" />,       color: "#0ea5e9" },
  { type: "change_lead_status",       label: "Change Lead Status",        icon: <UserCheck className="w-3.5 h-3.5" />,       color: "#0ea5e9" },
  { type: "add_note",                 label: "Add Note",                  icon: <StickyNote className="w-3.5 h-3.5" />,      color: "#64748b" },
  { type: "trigger_make_scenario",    label: "Trigger Make Scenario",     icon: <Webhook className="w-3.5 h-3.5" />,         color: "#f97316" },
  { type: "send_webhook",             label: "Send Webhook",              icon: <Webhook className="w-3.5 h-3.5" />,         color: "#64748b" },
  { type: "send_email_notification",  label: "Send Email",                icon: <Mail className="w-3.5 h-3.5" />,            color: "#6366f1" },
  { type: "delay",                    label: "Delay",                     icon: <Clock className="w-3.5 h-3.5" />,           color: "#64748b" },
  { type: "retry",                    label: "Retry",                     icon: <RefreshCw className="w-3.5 h-3.5" />,       color: "#f59e0b" },
];

const LOGIC_NODES: Array<{ type: WorkflowLogicType; label: string; icon: React.ReactNode; color: string }> = [
  { type: "if_else",            label: "If / Else",           icon: <GitBranch className="w-3.5 h-3.5" />,   color: "#a855f7" },
  { type: "switch",             label: "Switch",               icon: <Shuffle className="w-3.5 h-3.5" />,     color: "#a855f7" },
  { type: "wait",               label: "Wait",                 icon: <Clock className="w-3.5 h-3.5" />,       color: "#64748b" },
  { type: "merge",              label: "Merge",                icon: <Merge className="w-3.5 h-3.5" />,       color: "#64748b" },
  { type: "parallel_execution", label: "Parallel Execution",   icon: <GitMerge className="w-3.5 h-3.5" />,   color: "#a855f7" },
  { type: "stop_workflow",      label: "Stop Workflow",        icon: <StopCircle className="w-3.5 h-3.5" />,  color: "#ef4444" },
];

// ─── Node dimensions ─────────────────────────────────────────────────────────

const NODE_W = 200;
const NODE_H = 72;
const PORT_R = 6;

function nodeColor(node: WorkflowNode): string {
  const d = node.data;
  if (d.category === "trigger") {
    return TRIGGER_NODES.find(n => n.type === d.trigger_type)?.color ?? "#6366f1";
  }
  if (d.category === "action") {
    return ACTION_NODES.find(n => n.type === d.action_type)?.color ?? "#3b82f6";
  }
  return LOGIC_NODES.find(n => n.type === d.logic_type)?.color ?? "#a855f7";
}

function categoryBadge(category: string) {
  if (category === "trigger") return { bg: "bg-violet-100", text: "text-violet-700", label: "TRIGGER" };
  if (category === "action")  return { bg: "bg-blue-100",   text: "text-blue-700",   label: "ACTION" };
  return                             { bg: "bg-purple-100", text: "text-purple-700", label: "LOGIC" };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface WorkflowBuilderProps {
  workflow: Workflow;
  onSave: (nodes: WorkflowNode[], edges: WorkflowEdge[]) => void | Promise<void>;
  onActivate: (active: boolean) => void | Promise<void>;
  onClone: () => void;
  onExport: () => void;
  onImport: (payload: Record<string, unknown>) => void;
  saving?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function WorkflowBuilder({
  workflow, onSave, onActivate, onClone, onExport, onImport, saving,
}: WorkflowBuilderProps) {
  const [nodes, setNodes] = useState<WorkflowNode[]>(workflow.nodes ?? []);
  const [edges, setEdges] = useState<WorkflowEdge[]>(workflow.edges ?? []);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ id: string; ox: number; oy: number } | null>(null);
  const [pendingEdge, setPendingEdge] = useState<{ sourceId: string; x: number; y: number } | null>(null);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [showPalette, setShowPalette] = useState(false);
  const [paletteTab, setPaletteTab] = useState<"trigger" | "action" | "logic">("trigger");
  const canvasRef = useRef<SVGSVGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync if workflow prop changes
  useEffect(() => {
    setNodes(workflow.nodes ?? []);
    setEdges(workflow.edges ?? []);
  }, [workflow.id]);

  // ── Port positions ─────────────────────────────────────────────────────────

  const outPort = (n: WorkflowNode) => ({
    x: n.position.x + panOffset.x + NODE_W,
    y: n.position.y + panOffset.y + NODE_H / 2,
  });
  const inPort = (n: WorkflowNode) => ({
    x: n.position.x + panOffset.x,
    y: n.position.y + panOffset.y + NODE_H / 2,
  });

  // ── Edge path (cubic bezier) ───────────────────────────────────────────────

  const edgePath = (x1: number, y1: number, x2: number, y2: number) => {
    const cx = (x1 + x2) / 2;
    return `M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`;
  };

  // ── Canvas mouse events ────────────────────────────────────────────────────

  const onCanvasMouseDown = (e: RMouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const target = e.target as SVGElement;
    if (target === canvasRef.current || target.tagName === "rect" && target.dataset.canvas) {
      setPanning(true);
      setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
      setSelected(null);
    }
  };

  const onCanvasMouseMove = (e: RMouseEvent<SVGSVGElement>) => {
    if (panning) {
      setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
    if (dragging) {
      setNodes(prev =>
        prev.map(n =>
          n.id === dragging.id
            ? { ...n, position: { x: e.clientX - dragging.ox - panOffset.x, y: e.clientY - dragging.oy - panOffset.y } }
            : n
        )
      );
    }
    if (pendingEdge && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      setPendingEdge(prev => prev ? { ...prev, x: e.clientX - rect.left, y: e.clientY - rect.top } : null);
    }
  };

  const onCanvasMouseUp = () => {
    setPanning(false);
    setDragging(null);
    setPendingEdge(null);
  };

  // ── Node drag ─────────────────────────────────────────────────────────────

  const onNodeMouseDown = (e: RMouseEvent, id: string) => {
    e.stopPropagation();
    const node = nodes.find(n => n.id === id)!;
    setDragging({ id, ox: e.clientX - node.position.x - panOffset.x, oy: e.clientY - node.position.y - panOffset.y });
    setSelected(id);
  };

  // ── Port interactions ──────────────────────────────────────────────────────

  const onOutPortMouseDown = (e: RMouseEvent, sourceId: string) => {
    e.stopPropagation();
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      setPendingEdge({ sourceId, x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  };

  const onInPortMouseUp = (e: RMouseEvent, targetId: string) => {
    e.stopPropagation();
    if (pendingEdge && pendingEdge.sourceId !== targetId) {
      const edgeId = `e-${pendingEdge.sourceId}-${targetId}-${Date.now()}`;
      const exists = edges.some(edge => edge.source === pendingEdge.sourceId && edge.target === targetId);
      if (!exists) {
        setEdges(prev => [...prev, { id: edgeId, source: pendingEdge.sourceId, target: targetId, animated: false }]);
      }
    }
    setPendingEdge(null);
  };

  // ── Delete node / edge ─────────────────────────────────────────────────────

  const deleteNode = (id: string) => {
    setNodes(prev => prev.filter(n => n.id !== id));
    setEdges(prev => prev.filter(e => e.source !== id && e.target !== id));
    setSelected(null);
  };

  const deleteEdge = (id: string) => {
    setEdges(prev => prev.filter(e => e.id !== id));
  };

  // ── Add node from palette ──────────────────────────────────────────────────

  const addNode = (
    category: "trigger" | "action" | "logic",
    subType: string,
    label: string
  ) => {
    const id = `node-${Date.now()}`;
    const baseX = 200 - panOffset.x;
    const baseY = 100 + nodes.length * 100 - panOffset.y;
    const data: WorkflowNodeData = {
      label,
      category,
      ...(category === "trigger" ? { trigger_type: subType as WorkflowTriggerType } : {}),
      ...(category === "action"  ? { action_type:  subType as WorkflowActionType  } : {}),
      ...(category === "logic"   ? { logic_type:   subType as WorkflowLogicType   } : {}),
      config: {},
    };
    setNodes(prev => [...prev, { id, type: category, position: { x: baseX, y: baseY }, data }]);
    setShowPalette(false);
  };

  // ── Import JSON ────────────────────────────────────────────────────────────

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const payload = JSON.parse(ev.target?.result as string);
        onImport(payload);
      } catch {
        alert("Invalid workflow JSON");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const isActive = workflow.status === "active";
  const selectedNode = nodes.find(n => n.id === selected);

  return (
    <div className="flex flex-col h-full min-h-[600px] bg-[#0f1117] rounded-xl overflow-hidden border border-slate-800">

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#161b26] border-b border-slate-800 shrink-0">
        <span className="font-semibold text-white text-sm truncate max-w-[160px]">{workflow.name}</span>
        <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${isActive ? "bg-emerald-900 text-emerald-300" : "bg-slate-700 text-slate-300"}`}>
          {workflow.status}
        </span>

        <div className="flex-1" />

        <Button size="sm" variant="ghost" className="text-slate-300 hover:text-white h-7 px-2 gap-1"
          onClick={() => setShowPalette(s => !s)}>
          <Plus className="w-3.5 h-3.5" /> Add Node
        </Button>

        <Button size="sm" variant="ghost" className="text-slate-300 hover:text-white h-7 px-2 gap-1"
          onClick={() => onSave(nodes, edges)} disabled={saving}>
          <Save className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save"}
        </Button>

        <Button size="sm" variant="ghost" className="text-slate-300 hover:text-white h-7 px-2 gap-1"
          onClick={() => onActivate(!isActive)}>
          {isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          {isActive ? "Deactivate" : "Activate"}
        </Button>

        <Button size="sm" variant="ghost" className="text-slate-300 hover:text-white h-7 px-2"
          title="Clone" onClick={onClone}><Copy className="w-3.5 h-3.5" /></Button>

        <Button size="sm" variant="ghost" className="text-slate-300 hover:text-white h-7 px-2"
          title="Export JSON" onClick={onExport}><Download className="w-3.5 h-3.5" /></Button>

        <Button size="sm" variant="ghost" className="text-slate-300 hover:text-white h-7 px-2"
          title="Import JSON" onClick={() => fileInputRef.current?.click()}>
          <Upload className="w-3.5 h-3.5" />
        </Button>
        <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* Node palette sidebar */}
        {showPalette && (
          <div className="w-56 bg-[#161b26] border-r border-slate-800 flex flex-col shrink-0 overflow-y-auto">
            <div className="flex border-b border-slate-800">
              {(["trigger", "action", "logic"] as const).map(t => (
                <button key={t}
                  className={`flex-1 py-2 text-[11px] font-semibold uppercase tracking-wide transition-colors ${paletteTab === t ? "text-white border-b-2 border-indigo-500" : "text-slate-500 hover:text-slate-300"}`}
                  onClick={() => setPaletteTab(t)}>
                  {t}
                </button>
              ))}
            </div>
            <div className="p-2 space-y-1">
              {paletteTab === "trigger" && TRIGGER_NODES.map(n => (
                <button key={n.type}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-700 text-left text-xs transition-colors"
                  onClick={() => addNode("trigger", n.type, n.label)}>
                  <span style={{ color: n.color }}>{n.icon}</span>
                  {n.label}
                </button>
              ))}
              {paletteTab === "action" && ACTION_NODES.map(n => (
                <button key={n.type}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-700 text-left text-xs transition-colors"
                  onClick={() => addNode("action", n.type, n.label)}>
                  <span style={{ color: n.color }}>{n.icon}</span>
                  {n.label}
                </button>
              ))}
              {paletteTab === "logic" && LOGIC_NODES.map(n => (
                <button key={n.type}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-700 text-left text-xs transition-colors"
                  onClick={() => addNode("logic", n.type, n.label)}>
                  <span style={{ color: n.color }}>{n.icon}</span>
                  {n.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* SVG Canvas */}
        <div className="flex-1 relative overflow-hidden">
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-slate-600 text-center">
                <Zap className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">Click <span className="text-indigo-400">Add Node</span> to start building</p>
                <p className="text-xs mt-1 opacity-60">Drag nodes to arrange · Connect ports to link steps</p>
              </div>
            </div>
          )}

          <svg
            ref={canvasRef}
            className="w-full h-full cursor-grab active:cursor-grabbing select-none"
            onMouseDown={onCanvasMouseDown}
            onMouseMove={onCanvasMouseMove}
            onMouseUp={onCanvasMouseUp}
            onMouseLeave={onCanvasMouseUp}
          >
            {/* Dot grid */}
            <defs>
              <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"
                patternTransform={`translate(${panOffset.x % 24},${panOffset.y % 24})`}>
                <circle cx="12" cy="12" r="1" fill="#1e2535" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" data-canvas="true" />

            {/* Edges */}
            {edges.map(edge => {
              const src = nodes.find(n => n.id === edge.source);
              const tgt = nodes.find(n => n.id === edge.target);
              if (!src || !tgt) return null;
              const s = outPort(src), t = inPort(tgt);
              return (
                <g key={edge.id}>
                  <path d={edgePath(s.x, s.y, t.x, t.y)}
                    fill="none" stroke="#334155" strokeWidth={2}
                    strokeDasharray={edge.animated ? "6 3" : undefined} />
                  {/* invisible wider hit area */}
                  <path d={edgePath(s.x, s.y, t.x, t.y)}
                    fill="none" stroke="transparent" strokeWidth={12}
                    className="cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); deleteEdge(edge.id); }} />
                  {edge.label && (
                    <text x={(s.x + t.x) / 2} y={(s.y + t.y) / 2 - 6}
                      fill="#64748b" fontSize={10} textAnchor="middle">{edge.label}</text>
                  )}
                </g>
              );
            })}

            {/* Pending edge (while dragging from port) */}
            {pendingEdge && (() => {
              const src = nodes.find(n => n.id === pendingEdge.sourceId);
              if (!src) return null;
              const s = outPort(src);
              return (
                <path d={edgePath(s.x, s.y, pendingEdge.x, pendingEdge.y)}
                  fill="none" stroke="#6366f1" strokeWidth={2} strokeDasharray="6 3" />
              );
            })()}

            {/* Nodes */}
            {nodes.map(node => {
              const px = node.position.x + panOffset.x;
              const py = node.position.y + panOffset.y;
              const color = nodeColor(node);
              const badge = categoryBadge(node.data.category);
              const isSelected = selected === node.id;

              return (
                <g key={node.id} style={{ cursor: "move" }}
                  onMouseDown={e => onNodeMouseDown(e, node.id)}>
                  {/* Shadow */}
                  <rect x={px + 2} y={py + 4} width={NODE_W} height={NODE_H}
                    rx={10} fill="rgba(0,0,0,0.4)" />
                  {/* Card */}
                  <rect x={px} y={py} width={NODE_W} height={NODE_H}
                    rx={10}
                    fill="#1e2535"
                    stroke={isSelected ? color : "#2d3748"}
                    strokeWidth={isSelected ? 2 : 1} />
                  {/* Color accent bar */}
                  <rect x={px} y={py} width={4} height={NODE_H} rx={2} fill={color} />

                  {/* Badge */}
                  <text x={px + 14} y={py + 18} fontSize={9} fill={color}
                    fontWeight="700" letterSpacing="0.08em">
                    {badge.label}
                  </text>

                  {/* Label */}
                  <text x={px + 14} y={py + 36} fontSize={12} fill="#e2e8f0" fontWeight="500">
                    {node.data.label.length > 22 ? node.data.label.slice(0, 22) + "…" : node.data.label}
                  </text>

                  {/* Config preview */}
                  {node.data.description && (
                    <text x={px + 14} y={py + 52} fontSize={9} fill="#64748b">
                      {node.data.description.slice(0, 28)}
                    </text>
                  )}

                  {/* Delete button */}
                  {isSelected && (
                    <g onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }}
                      style={{ cursor: "pointer" }}>
                      <circle cx={px + NODE_W - 10} cy={py + 10} r={9} fill="#ef4444" />
                      <line x1={px + NODE_W - 14} y1={py + 6}  x2={px + NODE_W - 6} y2={py + 14} stroke="white" strokeWidth={1.5} />
                      <line x1={px + NODE_W - 6}  y1={py + 6}  x2={px + NODE_W - 14} y2={py + 14} stroke="white" strokeWidth={1.5} />
                    </g>
                  )}

                  {/* Input port */}
                  {node.data.category !== "trigger" && (
                    <circle cx={px} cy={py + NODE_H / 2} r={PORT_R}
                      fill="#1e2535" stroke="#6366f1" strokeWidth={2}
                      style={{ cursor: "crosshair" }}
                      onMouseUp={e => onInPortMouseUp(e, node.id)} />
                  )}

                  {/* Output port */}
                  {node.data.category !== "logic" || node.data.logic_type !== "stop_workflow" ? (
                    <circle cx={px + NODE_W} cy={py + NODE_H / 2} r={PORT_R}
                      fill="#1e2535" stroke="#6366f1" strokeWidth={2}
                      style={{ cursor: "crosshair" }}
                      onMouseDown={e => onOutPortMouseDown(e, node.id)} />
                  ) : null}

                  {/* If/Else: True / False ports */}
                  {(node.data.logic_type === "if_else" || node.data.logic_type === "switch") && (
                    <>
                      <circle cx={px + NODE_W} cy={py + NODE_H / 2 - 14} r={PORT_R - 1}
                        fill="#1e2535" stroke="#10b981" strokeWidth={2}
                        style={{ cursor: "crosshair" }}
                        onMouseDown={e => onOutPortMouseDown(e, `${node.id}__true`)} />
                      <text x={px + NODE_W + 9} y={py + NODE_H / 2 - 10}
                        fontSize={9} fill="#10b981">true</text>
                      <circle cx={px + NODE_W} cy={py + NODE_H / 2 + 14} r={PORT_R - 1}
                        fill="#1e2535" stroke="#ef4444" strokeWidth={2}
                        style={{ cursor: "crosshair" }}
                        onMouseDown={e => onOutPortMouseDown(e, `${node.id}__false`)} />
                      <text x={px + NODE_W + 9} y={py + NODE_H / 2 + 18}
                        fontSize={9} fill="#ef4444">false</text>
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Inspector panel */}
        {selectedNode && (
          <div className="w-64 bg-[#161b26] border-l border-slate-800 flex flex-col shrink-0 overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <span className="text-sm font-semibold text-white">Node Config</span>
              <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-slate-300">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4 text-sm">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Label</label>
                <input
                  className="w-full bg-[#0f1117] border border-slate-700 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-indigo-500"
                  value={selectedNode.data.label}
                  onChange={e => setNodes(prev => prev.map(n =>
                    n.id === selectedNode.id
                      ? { ...n, data: { ...n.data, label: e.target.value } }
                      : n
                  ))}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Description</label>
                <textarea
                  rows={2}
                  className="w-full bg-[#0f1117] border border-slate-700 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-indigo-500 resize-none"
                  value={selectedNode.data.description ?? ""}
                  onChange={e => setNodes(prev => prev.map(n =>
                    n.id === selectedNode.id
                      ? { ...n, data: { ...n.data, description: e.target.value } }
                      : n
                  ))}
                />
              </div>
              {selectedNode.data.trigger_type === "cron" && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Cron Expression</label>
                  <input
                    className="w-full bg-[#0f1117] border border-slate-700 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-indigo-500 font-mono"
                    placeholder="0 9 * * 1-5"
                    value={(selectedNode.data.config?.cron_expression as string) ?? ""}
                    onChange={e => setNodes(prev => prev.map(n =>
                      n.id === selectedNode.id
                        ? { ...n, data: { ...n.data, config: { ...n.data.config, cron_expression: e.target.value } } }
                        : n
                    ))}
                  />
                </div>
              )}
              {selectedNode.data.action_type === "delay" && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Delay (seconds)</label>
                  <input type="number" min={1}
                    className="w-full bg-[#0f1117] border border-slate-700 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-indigo-500"
                    value={(selectedNode.data.config?.delay_seconds as number) ?? 60}
                    onChange={e => setNodes(prev => prev.map(n =>
                      n.id === selectedNode.id
                        ? { ...n, data: { ...n.data, config: { ...n.data.config, delay_seconds: Number(e.target.value) } } }
                        : n
                    ))}
                  />
                </div>
              )}
              {(selectedNode.data.action_type === "trigger_make_scenario" || selectedNode.data.action_type === "send_webhook") && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Webhook URL</label>
                  <input
                    className="w-full bg-[#0f1117] border border-slate-700 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-indigo-500"
                    placeholder="https://hook.make.com/…"
                    value={(selectedNode.data.config?.webhook_url as string) ?? ""}
                    onChange={e => setNodes(prev => prev.map(n =>
                      n.id === selectedNode.id
                        ? { ...n, data: { ...n.data, config: { ...n.data.config, webhook_url: e.target.value } } }
                        : n
                    ))}
                  />
                </div>
              )}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Node ID</label>
                <span className="text-xs text-slate-500 font-mono">{selectedNode.id}</span>
              </div>
              <Button size="sm" variant="destructive" className="w-full gap-1 text-xs h-7"
                onClick={() => deleteNode(selectedNode.id)}>
                <Trash2 className="w-3.5 h-3.5" /> Delete Node
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
