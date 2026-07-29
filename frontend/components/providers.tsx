"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect, type ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
    },
  }));

  useEffect(() => {
    // Browsers throttle timers (including Supabase's own token auto-refresh)
    // once a tab is backgrounded for a while. Rather than trust that timer
    // alone, explicitly check the session and re-fetch everything the
    // moment the user comes back to the tab — this is what makes the app
    // recover on its own instead of needing a manual page reload.
    async function recoverOnReturn() {
      if (document.visibilityState !== "visible") return;
      const supabase = createSupabaseBrowserClient();
      try {
        await supabase.auth.getSession(); // triggers a refresh if the token is stale
      } catch {
        // ignore — if this fails the user will hit a normal auth redirect
      }
      queryClient.invalidateQueries();
    }

    document.addEventListener("visibilitychange", recoverOnReturn);
    window.addEventListener("focus", recoverOnReturn);
    return () => {
      document.removeEventListener("visibilitychange", recoverOnReturn);
      window.removeEventListener("focus", recoverOnReturn);
    };
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}
