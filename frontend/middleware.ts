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
    pathname.startsWith("/rejected")
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
        setAll: (cookiesToSet) => {
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

  // Check approval status from backend
  try {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/admin/approvals/me/status`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (res.ok) {
      const { status, role } = await res.json();

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
  } catch {
    // If check fails, allow through (don't block on API errors)
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
