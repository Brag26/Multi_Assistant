import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const cookieStore = await cookies();

  if (code) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) =>
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            ),
        },
      }
    );

    await supabase.auth.exchangeCodeForSession(code);
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const token = (await supabase.auth.getSession()).data.session?.access_token;

      // Register user with backend (creates membership + approval request if new)
      try {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/approvals/register`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: user.email,
            display_name: user.user_metadata?.full_name ?? user.email,
          }),
        });
      } catch {
        // Non-blocking — don't fail login if this errors
      }

      // Check approval status and route accordingly
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/admin/approvals/me/status`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (res.ok) {
          const { status, role } = await res.json();

          if (status === "pending") {
            return NextResponse.redirect(new URL("/pending", request.url));
          }
          if (status === "rejected") {
            return NextResponse.redirect(new URL("/rejected", request.url));
          }
          // superadmin goes to dashboard like everyone else
        }
      } catch {
        // Fall through to dashboard
      }
    }
  }

  return NextResponse.redirect(new URL("/dashboard", request.url));
}
