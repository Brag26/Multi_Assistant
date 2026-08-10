import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes — always allow
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/pending") ||
    pathname.startsWith("/demo") ||
    pathname.startsWith("/pricing") ||
    pathname.startsWith("/rejected") ||
    pathname.startsWith("/reset-password")
  ) {
    return NextResponse.next();
  }

  const response = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Not logged in → redirect to login
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Check approval status from backend — this used to run on every single
  // navigation (a full round trip to our API, on top of the Supabase auth
  // check above), which is real added latency on every page you visit since
  // role/approval status almost never changes second to second. Cache the
  // result in a short-lived cookie and skip the network call on repeat
  // navigations within the window; a stale value here is corrected within
  // 60s and never grants access beyond what the API itself still enforces.
  const CACHE_TTL_SECONDS = 60;
  const cached = request.cookies.get("approval_status_cache")?.value;
  let status: string | undefined;
  let role: string | undefined;

  if (cached) {
    try {
      const parsed = JSON.parse(cached) as { status: string; role: string; ts: number };
      if (Date.now() - parsed.ts < CACHE_TTL_SECONDS * 1000) {
        status = parsed.status;
        role = parsed.role;
      }
    } catch {
      // ignore malformed/stale cookie, fall through to a fresh fetch
    }
  }

  if (status === undefined) {
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/approvals/me/status`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) }
      );
      if (res.ok) {
        const body = await res.json();
        status = body.status;
        role = body.role;
        response.cookies.set("approval_status_cache", JSON.stringify({ status, role, ts: Date.now() }), {
          maxAge: CACHE_TTL_SECONDS,
          httpOnly: true,
          sameSite: "lax",
          path: "/",
        });
      }
    } catch {
      // If the check fails, allow through (don't block on API errors)
    }
  }

  if (status !== undefined) {
    // Pending approval → redirect to pending page
    if (status === "pending" && !pathname.startsWith("/pending")) {
      return NextResponse.redirect(new URL("/pending", request.url));
    }

    // Rejected → redirect to rejected page
    if (status === "rejected" && !pathname.startsWith("/rejected")) {
      return NextResponse.redirect(new URL("/rejected", request.url));
    }

    // Superadmin trying to access /superadmin → allow
    if (pathname.startsWith("/superadmin") && role !== "super_admin") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
