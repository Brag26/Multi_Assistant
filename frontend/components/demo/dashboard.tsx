"use client";

import { useState, useEffect } from "react";
import { DashboardShell } from "@/components/dashboard/shell";
import { DemoBanner } from "@/components/demo/demo-banner";
import { DEMO_DATA } from "@/components/demo/demo-context";
import { Card, CardContent } from "@/components/ui/card";
import {
  PhoneCall, Users, CalendarCheck, Activity, TrendingUp,
  Bell, CheckCircle, AlertTriangle, Info, Zap,
} from "lucide-react";

// Animate a counter from 0 to target
function useCounter(target: number, duration = 800) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setValue(target); clearInterval(timer); }
      else setValue(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return value;
}

// Simple sparkline bar chart
function SparkBars({ data }: { data: { day: string; count: number }[] }) {
  const max = Math.max(...data.map(d => d.count));
  return (
    <div className="flex items-end gap-1 h-16">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full rounded-t-sm transition-all"
            style={{
              height: `${(d.count / max) * 100}%`,
              background: i === data.length - 1
                ? "linear-gradient(135deg, #6366f1, #7c3aed)"
                : "#e0e7ff",
              minHeight: 4,
            }}
          />
          <span className="text-[9px] text-slate-400">
            {new Date(d.day).toLocaleDateString("en", { weekday: "short" }).slice(0, 1)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function DemoDashboardPage() {
  const { snapshot, activeCalls, analytics, notifications } = DEMO_DATA;

  // Animated counters
  const callsToday = useCounter(snapshot.calls_today);
  const leadsToday = useCounter(snapshot.leads_today);
  const appts = useCounter(snapshot.appointments_today);
  const totalCalls = useCounter(analytics.total_calls, 1200);

  // Simulate a new call coming in every 8 seconds
  const [liveCallCount, setLiveCallCount] = useState(activeCalls.length);
  useEffect(() => {
    const timer = setInterval(() => {
      setLiveCallCount(c => c === 3 ? 2 : 3);
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  const stats = [
    { label: "Active Calls", value: liveCallCount, icon: PhoneCall, color: "text-emerald-600", bg: "bg-emerald-50", pulse: true },
    { label: "Calls Today", value: callsToday, icon: Activity, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Leads Today", value: leadsToday, icon: Users, color: "text-violet-600", bg: "bg-violet-50" },
    { label: "Appointments", value: appts, icon: CalendarCheck, color: "text-amber-600", bg: "bg-amber-50" },
  ];

  const notifIcons: Record<string, React.ReactNode> = {
    success: <CheckCircle className="w-4 h-4 text-emerald-500" />,
    warning: <AlertTriangle className="w-4 h-4 text-amber-500" />,
    info: <Info className="w-4 h-4 text-blue-500" />,
  };

  return (
    <DashboardShell>
      <DemoBanner />

      <div className="mt-4 mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-blue-700">Overview</p>
          <h2 className="text-2xl font-semibold tracking-tight">Real-Time Dashboard</h2>
        </div>
        <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium bg-emerald-50 text-emerald-700">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Live Demo
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map(s => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${s.bg} relative`}>
                <span className={s.color}><s.icon className="w-5 h-5" /></span>
                {s.pulse && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping opacity-75" />
                )}
              </div>
              <div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        {/* Analytics summary */}
        <Card className="lg:col-span-2">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm text-slate-700">Calls This Week</h3>
              <span className="text-xs text-slate-400">Last 7 days</span>
            </div>
            <SparkBars data={analytics.calls_by_day} />
            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-100">
              <div>
                <p className="text-xs text-slate-500">Total Calls</p>
                <p className="text-lg font-bold text-slate-800">{totalCalls.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Completion Rate</p>
                <p className="text-lg font-bold text-emerald-600">
                  {(analytics.completion_rate * 100).toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Avg Duration</p>
                <p className="text-lg font-bold text-slate-800">{analytics.avg_duration_seconds}s</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lead funnel */}
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold text-sm text-slate-700 mb-4">Lead Funnel</h3>
            <div className="space-y-2">
              {Object.entries(analytics.lead_funnel).map(([stage, count]) => {
                const max = analytics.lead_funnel.new;
                const pct = Math.round((count / max) * 100);
                const colors: Record<string, string> = {
                  new: "#e0e7ff",
                  contacted: "#c7d2fe",
                  qualified: "#818cf8",
                  converted: "#4f46e5",
                };
                return (
                  <div key={stage}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="capitalize text-slate-600">{stage}</span>
                      <span className="font-semibold text-slate-800">{count.toLocaleString()}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: colors[stage] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Active calls */}
        <div className="lg:col-span-2 space-y-3">
          <h3 className="font-semibold text-sm text-slate-700">Active Calls</h3>
          {activeCalls.slice(0, liveCallCount).map(call => (
            <Card key={call.id} className="border-l-4 border-l-emerald-500">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                    <PhoneCall className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{call.customer_phone}</p>
                    <p className="text-xs text-slate-500">
                      {Math.floor((Date.now() - new Date(call.started_at).getTime()) / 1000)}s elapsed
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                    In Progress
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Recent calls */}
          <h3 className="font-semibold text-sm text-slate-700 pt-2">Recent Calls</h3>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-slate-500">
                    <th className="px-4 py-2.5">Phone</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Outcome</th>
                    <th className="px-4 py-2.5">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.recent_calls.map(c => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-mono text-xs">{c.customer_phone}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          c.status === "completed" ? "bg-emerald-50 text-emerald-700" :
                          c.status === "failed" ? "bg-red-50 text-red-700" :
                          "bg-blue-50 text-blue-700"
                        }`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 capitalize">
                        {c.outcome.replace("_", " ")}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">
                        {c.duration_seconds > 0 ? `${c.duration_seconds}s` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>

        {/* Notifications */}
        <div>
          <h3 className="font-semibold text-sm text-slate-700 mb-3 flex items-center gap-1.5">
            <Bell className="w-4 h-4" /> Notifications
          </h3>
          <div className="space-y-2">
            {notifications.map(n => (
              <Card key={n.id} className={n.read ? "opacity-60" : ""}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-2.5">
                    {notifIcons[n.type] ?? <Info className="w-4 h-4 text-slate-400" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-700">{n.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{n.message}</p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        {Math.floor((Date.now() - new Date(n.created_at).getTime()) / 60000)}m ago
                      </p>
                    </div>
                    {!n.read && <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0 mt-0.5" />}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
