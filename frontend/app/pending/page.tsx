"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export default function PendingPage() {
  const [email, setEmail] = useState("");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? "");
    });
  }, []);

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-yellow-100">
          <svg className="h-10 w-10 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-slate-800">Awaiting Approval</h1>
        <p className="mt-3 text-slate-500">
          Your account <span className="font-medium text-slate-700">{email}</span> is
          pending approval from the administrator.
        </p>
        <p className="mt-2 text-sm text-slate-400">
          You&apos;ll receive an email once your account has been reviewed. This usually takes less than 24 hours.
        </p>

        <div className="mt-8 rounded-lg border border-slate-200 bg-white p-4 text-left">
          <h2 className="text-sm font-semibold text-slate-600">What happens next?</h2>
          <ul className="mt-2 space-y-2 text-sm text-slate-500">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-yellow-500">①</span>
              Admin reviews your access request
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-yellow-500">②</span>
              You receive an email notification
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-yellow-500">③</span>
              Sign in again to access your dashboard
            </li>
          </ul>
        </div>

        <button
          onClick={handleSignOut}
          className="mt-6 text-sm text-slate-400 underline hover:text-slate-600"
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
