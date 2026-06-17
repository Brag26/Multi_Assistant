"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  async function signIn() {
    const supabase = createSupabaseBrowserClient();
    const origin = window.location.origin;
    await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${origin}/api/auth/callback` } });
    setSent(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="text-xl font-semibold">AI Voice Operations</h1>
          <p className="mt-1 text-sm text-slate-600">Sign in with your workspace email.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input type="email" placeholder="you@company.com" value={email} onChange={(event) => setEmail(event.target.value)} />
          <Button className="w-full" onClick={signIn} disabled={!email}>Send magic link</Button>
          {sent && <p className="text-sm text-slate-600">Check your inbox for the sign-in link.</p>}
        </CardContent>
      </Card>
    </main>
  );
}
