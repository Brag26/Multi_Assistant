"use client";

// lib/useLiveTranscript.ts
// Streams transcript chunks for an active call by polling the call_monitoring
// events endpoint at a fast interval while the call is in_progress, and stops
// once the call ends. This avoids needing a dedicated websocket server while
// still feeling "live" (1.5s granularity is imperceptible for transcript read-along).

import { useEffect, useRef, useState } from "react";
import { listCallEvents } from "@/lib/api";

interface TranscriptChunk {
  speaker: "agent" | "customer" | "system";
  text: string;
  timestamp: string;
}

export function useLiveTranscript(tenantId: string, callId: string | null, isActive: boolean) {
  const [chunks, setChunks] = useState<TranscriptChunk[]>([]);
  const seenIds = useRef<Set<string>>(new Set());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!tenantId || !callId) {
      setChunks([]);
      seenIds.current.clear();
      return;
    }

    const poll = async () => {
      try {
        const events = await listCallEvents(tenantId, callId);
        const newChunks: TranscriptChunk[] = [];

        for (const ev of events) {
          if (ev.event_type !== "transcript_chunk") continue;
          if (seenIds.current.has(ev.id)) continue;
          seenIds.current.add(ev.id);

          const data = ev.event_data as { speaker?: "agent" | "customer" | "system"; text?: string };
          newChunks.push({
            speaker: data.speaker ?? "system",
            text: data.text ?? "",
            timestamp: ev.recorded_at,
          });
        }

        if (newChunks.length > 0) {
          setChunks(prev => [...prev, ...newChunks]);
        }
      } catch {
        // swallow — call may not exist yet
      }
    };

    poll();

    if (isActive) {
      intervalRef.current = setInterval(poll, 1500);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [tenantId, callId, isActive]);

  return chunks;
}
