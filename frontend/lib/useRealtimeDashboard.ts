// lib/useRealtimeDashboard.ts
// Wraps Supabase Realtime subscriptions for the dashboard.
// Falls back to polling when the websocket is unavailable.

"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type RealtimeStatus = "connecting" | "live" | "polling";

interface UseRealtimeDashboardOptions {
  tenantId: string;
  /** Tables to watch in addition to defaults */
  extraTables?: string[];
  /** ms between polls when websocket is down; default 10 000 */
  pollIntervalMs?: number;
}

/**
 * Subscribes to Supabase Realtime changes for the dashboard.
 * Returns the current connection status so callers can show an indicator.
 *
 * All relevant TanStack Query keys are invalidated on each change so the UI
 * re-fetches automatically.
 *
 * Usage:
 *   const status = useRealtimeDashboard({ tenantId });
 */
export function useRealtimeDashboard({
  tenantId,
  extraTables = [],
  pollIntervalMs = 10_000,
}: UseRealtimeDashboardOptions): RealtimeStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["dashboard", tenantId] });
    queryClient.invalidateQueries({ queryKey: ["active-calls", tenantId] });
    queryClient.invalidateQueries({ queryKey: ["notifications", tenantId] });
    queryClient.invalidateQueries({ queryKey: ["analytics", tenantId] });
  };

  useEffect(() => {
    if (!tenantId) return;

    const supabase = createSupabaseBrowserClient();

    const defaultTables = [
      "voice_calls",
      "notifications",
      "appointments",
      "workflow_runs",
      "lead_activities",
    ];
    const tables = [...new Set([...defaultTables, ...extraTables])];

    let channel = supabase.channel(`realtime-dashboard:${tenantId}`);

    for (const table of tables) {
      channel = channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => invalidateAll()
      );
    }

    channel.subscribe(subStatus => {
      if (subStatus === "SUBSCRIBED") {
        setStatus("live");
        // Clear polling fallback when live
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } else if (subStatus === "CHANNEL_ERROR" || subStatus === "CLOSED") {
        setStatus("polling");
        // Start polling fallback
        if (!pollRef.current) {
          pollRef.current = setInterval(invalidateAll, pollIntervalMs);
        }
      }
    });

    // Safety-net polling always runs until Realtime confirms SUBSCRIBED
    const safetyPoll = setTimeout(() => {
      if (status !== "live") {
        setStatus("polling");
        pollRef.current = setInterval(invalidateAll, pollIntervalMs);
      }
    }, 5_000);

    return () => {
      clearTimeout(safetyPoll);
      if (pollRef.current) clearInterval(pollRef.current);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  return status;
}
