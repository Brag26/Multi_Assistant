"use client";

import Link from "next/link";
import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Workflow, PhoneCall, Users, Megaphone,
  Plug, CalendarCheck, Bell, BarChart2, Shield, Activity,
  TrendingUp, ShieldOff, Webhook, Trophy, FileBarChart,
  Sun, Moon, Sparkles,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";

interface NavItem {
  href: Route;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard",  label: "Dashboard",    icon: LayoutDashboard },
      { href: "/analytics",  label: "Analytics",    icon: BarChart2 },
      { href: "/reports",    label: "Reports",      icon: FileBarChart },
    ],
  },
  {
    label: "Automation",
    items: [
      { href: "/workflows",  label: "Workflows",    icon: Workflow },
      { href: "/monitoring", label: "Call Monitor", icon: Activity },
      { href: "/webhooks",   label: "Webhooks",     icon: Webhook },
    ],
  },
  {
    label: "CRM",
    items: [
      { href: "/leads",          label: "Leads",          icon: Users },
      { href: "/contacts",       label: "Contacts",       icon: Users },
      { href: "/lead-scoring",   label: "Lead Scoring",   icon: TrendingUp },
      { href: "/appointments",   label: "Appointments",   icon: CalendarCheck },
      { href: "/dnc",            label: "DNC List",       icon: ShieldOff },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/campaigns",          label: "Campaigns",        icon: Megaphone },
      { href: "/calls",              label: "Calls",            icon: PhoneCall },
      { href: "/agent-performance",  label: "Agent Leaderboard", icon: Trophy },
      { href: "/notifications",      label: "Notifications",    icon: Bell },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/integrations",  label: "Integrations", icon: Plug },
      { href: "/audit-logs",    label: "Audit Logs",   icon: Shield },
    ],
  },
];

interface Props {
  children: React.ReactNode;
}

export function DashboardShell({ children }: Props) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Sidebar */}
      <aside className="w-60 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0">
        <div className="px-4 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <span className="font-bold text-slate-800 dark:text-slate-100 text-lg tracking-tight">VoiceOps</span>
            <span className="ml-1.5 text-[10px] font-semibold bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded-full align-middle">AI</span>
          </div>
          <button onClick={toggleTheme}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Toggle dark mode">
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 px-2 py-3 overflow-y-auto">
          {NAV_GROUPS.map(group => (
            <div key={group.label} className="mb-4">
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map(item => {
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <Link key={item.href} href={item.href}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                        active
                          ? "bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-medium"
                          : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200"
                      }`}>
                      <item.icon className={`w-4 h-4 shrink-0 ${active ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400"}`} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <Link href="/onboarding"
          className="m-2 flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950 dark:to-blue-950 text-indigo-700 dark:text-indigo-300 hover:opacity-80 transition-opacity">
          <Sparkles className="w-4 h-4" /> Setup wizard
        </Link>

        <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400">
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
