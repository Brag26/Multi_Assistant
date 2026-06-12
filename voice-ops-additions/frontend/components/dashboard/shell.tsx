"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Workflow, PhoneCall, Users, Megaphone,
  Plug, CalendarCheck, Bell, BarChart2, Shield, Activity,
} from "lucide-react";

const NAV = [
  { href: "/dashboard",     label: "Dashboard",    icon: LayoutDashboard },
  { href: "/workflows",     label: "Workflows",    icon: Workflow },
  { href: "/monitoring",    label: "Call Monitor", icon: Activity },
  { href: "/calls",         label: "Calls",        icon: PhoneCall },
  { href: "/campaigns",     label: "Campaigns",    icon: Megaphone },
  { href: "/leads",         label: "Leads",        icon: Users },
  { href: "/contacts",      label: "Contacts",     icon: Users },
  { href: "/appointments",  label: "Appointments", icon: CalendarCheck },
  { href: "/analytics",     label: "Analytics",    icon: BarChart2 },
  { href: "/notifications", label: "Notifications",icon: Bell },
  { href: "/integrations",  label: "Integrations", icon: Plug },
  { href: "/audit-logs",    label: "Audit Logs",   icon: Shield },
];

interface Props {
  children: React.ReactNode;
}

export function DashboardShell({ children }: Props) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="px-4 py-5 border-b border-slate-100">
          <span className="font-bold text-slate-800 text-lg tracking-tight">VoiceOps</span>
          <span className="ml-1.5 text-[10px] font-semibold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full align-middle">AI</span>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {NAV.map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  active
                    ? "bg-indigo-50 text-indigo-700 font-medium"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                }`}>
                <item.icon className={`w-4 h-4 shrink-0 ${active ? "text-indigo-600" : "text-slate-400"}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-4 py-3 border-t border-slate-100 text-xs text-slate-400">
          AI Voice Operations Platform
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
