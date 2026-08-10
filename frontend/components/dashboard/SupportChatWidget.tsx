"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, LifeBuoy, Check } from "lucide-react";
import { useSessionStore } from "@/store/session";
import { getSupportConfig, sendSupportChat, escalateSupportChat } from "@/lib/api";

interface Message {
  role: "user" | "assistant";
  text: string;
}

export function SupportChatWidget() {
  const tenantId = useSessionStore((s) => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const [configured, setConfigured] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [escalated, setEscalated] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tenantId) return;
    getSupportConfig(tenantId).then((res) => setConfigured(res.configured)).catch(() => {});
  }, [tenantId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setSending(true);
    try {
      const res = await sendSupportChat(tenantId, text, chatId);
      setChatId(res.chat_id);
      setMessages((prev) => [...prev, { role: "assistant", text: res.reply }]);
    } catch (err: any) {
      const detail = err?.message ? String(err.message).slice(0, 300) : "Unknown error";
      setMessages((prev) => [...prev, { role: "assistant", text: `⚠️ ${detail}\n\nYou can escalate to a human below.` }]);
    } finally {
      setSending(false);
    }
  }

  async function handleEscalate() {
    setEscalating(true);
    try {
      const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")?.text || "Requesting help";
      await escalateSupportChat(tenantId, lastUserMessage, messages);
      setEscalated(true);
    } finally {
      setEscalating(false);
    }
  }

  if (!configured) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {open ? (
        <div className="w-80 sm:w-96 h-[28rem] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-indigo-600 text-white shrink-0">
            <span className="font-semibold text-sm flex items-center gap-1.5"><LifeBuoy className="w-4 h-4" /> Support</span>
            <button onClick={() => setOpen(false)}><X className="w-4 h-4" /></button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.length === 0 && (
              <p className="text-xs text-slate-400 text-center mt-6">Ask me anything about the platform — I'm here to help.</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  m.role === "user" ? "bg-indigo-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                }`}>
                  {m.text}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-3 py-2 text-sm bg-slate-100 dark:bg-slate-800 text-slate-400">…</div>
              </div>
            )}
          </div>

          <div className="px-3 pb-2 shrink-0">
            {escalated ? (
              <p className="text-xs text-emerald-600 flex items-center gap-1 justify-center py-1">
                <Check className="w-3.5 h-3.5" /> Sent — we'll follow up by email.
              </p>
            ) : messages.length > 0 ? (
              <button
                onClick={handleEscalate}
                disabled={escalating}
                className="w-full text-xs font-medium text-indigo-600 hover:text-indigo-700 py-1 disabled:opacity-50"
              >
                {escalating ? "Sending…" : "Still need help? Escalate to a human →"}
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-2 p-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Type a message…"
              className="flex-1 text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-200"
            />
            <button onClick={handleSend} disabled={!input.trim() || sending}
              className="p-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 shrink-0">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="w-14 h-14 rounded-full bg-indigo-600 text-white shadow-xl flex items-center justify-center hover:bg-indigo-700 transition-colors"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}
