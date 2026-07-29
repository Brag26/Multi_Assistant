import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Returns a single shared Supabase client for the whole app. Previously this
 * created a brand-new client (with its own auth auto-refresh timer) on every
 * call — with 7+ call sites, that meant multiple competing refresh timers,
 * and when the tab was backgrounded, the browser throttled them all, letting
 * the session token silently expire. Every API call then failed until a
 * manual page reload re-initialized auth from scratch.
 */
export function createSupabaseBrowserClient(): SupabaseClient {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return client;
}
