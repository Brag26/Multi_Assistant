"use client";

import { useEffect, useState } from "react";
import { Settings as SettingsIcon, Check } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/store/session";
import { getMySettings, updateMySettings } from "@/lib/api";
import { COMMON_TIMEZONES, detectBrowserTimezone } from "@/lib/timezones";

export default function SettingsPage() {
  const tenantId = useSessionStore((s) => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const [timezone, setTimezone] = useState(detectBrowserTimezone());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    getMySettings(tenantId)
      .then((res) => { if (res.timezone) setTimezone(res.timezone); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tenantId]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await updateMySettings(tenantId, timezone);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  const browserTz = detectBrowserTimezone();
  const timezoneOptions = COMMON_TIMEZONES.includes(browserTz) ? COMMON_TIMEZONES : [browserTz, ...COMMON_TIMEZONES];

  return (
    <DashboardShell>
      <div style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div className="mb-6">
          <p className="text-sm font-medium text-indigo-600">Account</p>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <SettingsIcon className="w-5 h-5" /> Settings
          </h1>
        </div>

        <Card className="max-w-md">
          <CardHeader>
            <h2 className="font-semibold text-slate-800">Timezone</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Used when scheduling campaigns and displaying call times throughout the app.
            </p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : (
              <div className="space-y-3">
                <select
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                >
                  {timezoneOptions.map((tz) => (
                    <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400">
                  Detected from your browser: {browserTz}
                </p>
                <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                  {saved ? <><Check className="w-3.5 h-3.5" /> Saved</> : saving ? "Saving…" : "Save"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
