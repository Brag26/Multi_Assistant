"use client";

import { useRef, useEffect } from "react";
import { useLiveTranscript } from "@/lib/useLiveTranscript";
import { MessageSquare, User, Bot } from "lucide-react";

interface Props {
  tenantId: string;
  callId: string | null;
  isActive: boolean;
}

export function LiveTranscriptPanel({ tenantId, callId, isActive }: Props) {
  const chunks = useLiveTranscript(tenantId, callId, isActive);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chunks.length]);

  if (!callId) return null;

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 border-b border-slate-200">
        <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-xs font-medium text-slate-600">Live transcript</span>
        {isActive && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-600">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
          </span>
        )}
      </div>
      <div className="max-h-56 overflow-y-auto p-3 space-y-2">
        {chunks.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">
            {isActive ? "Waiting for transcript…" : "No transcript captured"}
          </p>
        ) : (
          chunks.map((c, i) => (
            <div key={i} className={`flex gap-2 ${c.speaker === "agent" ? "" : "flex-row-reverse text-right"}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                c.speaker === "agent" ? "bg-blue-100" : "bg-slate-100"
              }`}>
                {c.speaker === "agent"
                  ? <Bot className="w-3.5 h-3.5 text-blue-600" />
                  : <User className="w-3.5 h-3.5 text-slate-500" />}
              </div>
              <div className={`text-xs px-3 py-1.5 rounded-lg max-w-[80%] ${
                c.speaker === "agent" ? "bg-blue-50 text-slate-700" : "bg-slate-100 text-slate-700"
              }`}>
                {c.text}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
