"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase";

export default function RejectedPage() {
  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
          <svg className="h-10 w-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-800">Access Denied</h1>
        <p className="mt-3 text-slate-500">
          Your access request was not approved. Please contact the administrator for more information.
        </p>
        <button
          onClick={handleSignOut}
          className="mt-6 rounded-lg bg-slate-800 px-6 py-2 text-sm text-white hover:bg-slate-700"
        >
          Back to Login
        </button>
      </div>
    </main>
  );
}
