"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Mic, MicOff, PhoneOff, Send, X, Settings, Loader2 } from "lucide-react";
import { useSessionStore } from "@/store/session";
import { getCopilotConfig, setupCopilot, setCopilotPublicKey, sendCopilotChat, type CopilotConfig } from "@/lib/api";

interface Message {
  role: "user" | "assistant";
  text: string;
}

type Mode = "text" | "voice";
type VoiceState = "idle" | "connecting" | "live";

/**
 * Floating "Jarvis" widget — superadmin only. Text mode uses Vapi's Chat
 * API (same assistant/tools as voice). Voice mode uses @vapi-ai/web for an
 * in-browser call — mic in, speech out, same tool-calling assistant.
 *
 * Loads @vapi-ai/web dynamically so it's never bundled/loaded for anyone
 * who isn't superadmin, and so a missing dependency (before `npm install`
 * picks up the new package.json entry) doesn't break the rest of the app.
 */
export function JarvisWidget() {
  const tenantId = useSessionStore((s) => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const role = useSessionStore((s) => s.role);

  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<CopilotConfig | null>(null);
  const [settingUp, setSettingUp] = useState(false);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [keyInput, setKeyInput] = useState("");

  const [mode, setMode] = useState<Mode>("text");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);

  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [muted, setMuted] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState<Message[]>([]);
  const vapiRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (role !== "super_admin" || !tenantId) return;
    getCopilotConfig(tenantId).then(setConfig).catch(() => {});
  }, [role, tenantId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, voiceTranscript, open]);

  if (role !== "super_admin") return null;

  async function handleSetup() {
    setSettingUp(true);
    try {
      const result = await setupCopilot(tenantId);
      setConfig(result);
      if (!result.vapi_public_key) setShowKeyInput(true);
    } catch (err: any) {
      alert(err?.message || "Setup failed — check the backend logs.");
    } finally {
      setSettingUp(false);
    }
  }

  async function handleSaveKey() {
    if (!keyInput.trim()) return;
    await setCopilotPublicKey(tenantId, keyInput.trim());
    const fresh = await getCopilotConfig(tenantId);
    setConfig(fresh);
    setShowKeyInput(false);
    setKeyInput("");
  }

  async function handleSendText() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setSending(true);
    try {
      const res = await sendCopilotChat(tenantId, text, chatId);
      setChatId(res.chat_id);
      setMessages((prev) => [...prev, { role: "assistant", text: res.reply || "…" }]);
    } catch (err: any) {
      setMessages((prev) => [...prev, { role: "assistant", text: `⚠️ ${err?.message || "Something went wrong."}` }]);
    } finally {
      setSending(false);
    }
  }

  async function startVoiceCall() {
    if (!config?.assistant_id || !config?.vapi_public_key) return;
    setVoiceState("connecting");
    setVoiceTranscript([]);
    try {
      // Dynamic import: keeps @vapi-ai/web out of the initial bundle for
      // everyone who isn't superadmin, and out of the critical path even
      // for superadmin until they actually open voice mode.
      const { default: Vapi } = await import("@vapi-ai/web");
      const vapi = new Vapi(config.vapi_public_key);
      vapiRef.current = vapi;

      vapi.on("call-start", () => setVoiceState("live"));
      vapi.on("call-end", () => { setVoiceState("idle"); vapiRef.current = null; });
      vapi.on("error", (e: any) => {
        console.error("Jarvis voice error:", e);
        setVoiceState("idle");
      });
      vapi.on("message", (message: any) => {
        if (message.type === "transcript" && message.transcriptType === "final") {
          setVoiceTranscript((prev) => [...prev, { role: message.role === "user" ? "user" : "assistant", text: message.transcript }]);
        }
      });

      vapi.start(config.assistant_id);
    } catch (err) {
      console.error("Failed to start Jarvis voice call:", err);
      setVoiceState("idle");
    }
  }

  function endVoiceCall() {
    vapiRef.current?.stop();
    setVoiceState("idle");
  }

  function toggleMute() {
    if (!vapiRef.current) return;
    const next = !muted;
    vapiRef.current.setMuted(next);
    setMuted(next);
  }

  return (
    <div className="fixed bottom-24 right-6 z-40">
      {open && (
        <div className="mb-3 w-96 max-w-[calc(100vw-3rem)] h-[520px] rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-indigo-600 to-violet-600 text-white">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5" />
              <span className="font-semibold">Jarvis</span>
            </div>
            <div className="flex items-center gap-1">
              {config?.configured && (
                <div className="flex rounded-lg bg-white/15 p-0.5 mr-1">
                  <button onClick={() => setMode("text")} className={`px-2 py-1 text-xs rounded-md ${mode === "text" ? "bg-white text-indigo-700 font-medium" : "text-white/80"}`}>Text</button>
                  <button onClick={() => setMode("voice")} className={`px-2 py-1 text-xs rounded-md ${mode === "voice" ? "bg-white text-indigo-700 font-medium" : "text-white/80"}`}>Voice</button>
                </div>
              )}
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-white/15 rounded-md"><X className="w-4 h-4" /></button>
            </div>
          </div>

          {/* Not set up yet */}
          {!config?.assistant_id ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-3">
              <Bot className="w-10 h-10 text-indigo-300" />
              <p className="text-sm text-slate-600">Jarvis hasn't been set up yet. This creates a dedicated Vapi assistant configured with tools to check on and control your platform.</p>
              <button
                onClick={handleSetup}
                disabled={settingUp}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {settingUp ? <><Loader2 className="w-4 h-4 animate-spin" /> Setting up…</> : "Set Up Jarvis"}
              </button>
            </div>
          ) : showKeyInput || !config?.vapi_public_key ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-3">
              <Settings className="w-8 h-8 text-indigo-300" />
              <p className="text-sm text-slate-600">One more step — Jarvis's voice mode needs your Vapi <b>public</b> key (dashboard.vapi.ai → API Keys → Public). Never your private key.</p>
              <input
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="pk_..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
              <button onClick={handleSaveKey} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">
                Save
              </button>
              <button onClick={() => setShowKeyInput(false)} className="text-xs text-slate-400 hover:text-slate-600">
                Skip for now — text mode still works
              </button>
            </div>
          ) : mode === "text" ? (
            <>
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 && (
                  <p className="text-sm text-slate-400 text-center mt-8">Ask about campaigns, accounts, calls — or tell Jarvis to launch/pause one.</p>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${m.role === "user" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-800"}`}>
                      {m.text}
                    </div>
                  </div>
                ))}
                {sending && <div className="text-xs text-slate-400">Jarvis is thinking…</div>}
              </div>
              <div className="border-t border-slate-100 p-3 flex items-center gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendText()}
                  placeholder="Ask Jarvis…"
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                />
                <button onClick={handleSendText} disabled={sending} className="p-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col">
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                {voiceTranscript.length === 0 && voiceState === "idle" && (
                  <p className="text-sm text-slate-400 text-center mt-8">Tap the mic to start talking to Jarvis.</p>
                )}
                {voiceTranscript.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${m.role === "user" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-800"}`}>
                      {m.text}
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-100 p-4 flex items-center justify-center gap-4">
                {voiceState === "idle" ? (
                  <button onClick={startVoiceCall} className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-indigo-600 text-white font-medium hover:bg-indigo-700">
                    <Mic className="w-4 h-4" /> Start talking
                  </button>
                ) : voiceState === "connecting" ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Connecting…</div>
                ) : (
                  <>
                    <button onClick={toggleMute} className={`p-3 rounded-full ${muted ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                      {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </button>
                    <button onClick={endVoiceCall} className="p-3 rounded-full bg-red-100 text-red-600 hover:bg-red-200">
                      <PhoneOff className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-xl flex items-center justify-center hover:scale-105 transition-transform"
        title="Jarvis"
      >
        <Bot className="w-6 h-6" />
      </button>
    </div>
  );
}
