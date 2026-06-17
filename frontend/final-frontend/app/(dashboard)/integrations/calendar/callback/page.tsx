"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSessionStore } from "@/store/session";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, CheckCircle, XCircle, Loader2 } from "lucide-react";

export default function CalendarCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantId = useSessionStore(s => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      setStatus("error");
      setErrorMsg(error);
      return;
    }

    if (!code || !tenantId) {
      setStatus("error");
      setErrorMsg("Missing authorization code or tenant context");
      return;
    }

    const redirectUri = `${window.location.origin}/integrations/calendar/callback`;

    apiFetch(`/tenants/${tenantId}/integrations/calendar/oauth/callback?code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(redirectUri)}`)
      .then(() => {
        setStatus("success");
        setTimeout(() => router.push("/integrations"), 2000);
      })
      .catch((err) => {
        setStatus("error");
        setErrorMsg(err.message || "Failed to connect calendar");
      });
  }, [searchParams, tenantId, router]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="p-8 text-center">
          {status === "loading" && (
            <>
              <Loader2 className="w-10 h-10 mx-auto mb-4 text-blue-500 animate-spin" />
              <p className="font-medium">Connecting your calendar…</p>
              <p className="text-sm text-slate-400 mt-1">This will just take a moment</p>
            </>
          )}
          {status === "success" && (
            <>
              <CheckCircle className="w-10 h-10 mx-auto mb-4 text-emerald-500" />
              <p className="font-medium">Calendar connected!</p>
              <p className="text-sm text-slate-400 mt-1">Redirecting you back…</p>
            </>
          )}
          {status === "error" && (
            <>
              <XCircle className="w-10 h-10 mx-auto mb-4 text-red-500" />
              <p className="font-medium">Connection failed</p>
              <p className="text-sm text-slate-400 mt-1">{errorMsg}</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
