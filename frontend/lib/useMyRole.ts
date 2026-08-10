"use client";

import { useQuery } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase";

interface MyStatus {
  status: string;
  role: string;
}

/**
 * The current user's role/approval status — shared across every component
 * that needs it via React Query's cache, instead of each page and the shell
 * separately re-fetching /admin/approvals/me/status on every mount. That
 * duplication was adding extra waterfalled round trips to page load; this
 * hook fetches once per session (5 min staleTime) and every caller reuses it.
 */
export function useMyRole() {
  return useQuery<MyStatus>({
    queryKey: ["my-role-status"],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return { status: "", role: "" };
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/approvals/me/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { status: "", role: "" };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
