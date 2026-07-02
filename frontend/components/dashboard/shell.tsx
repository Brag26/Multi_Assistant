"use client";

import Link from "next/link";
import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import {
  LayoutDashboard, Workflow, PhoneCall, Users, Megaphone,
  Plug, CalendarCheck, Bell, BarChart2, Shield, Activity,
  TrendingUp, ShieldOff, Webhook, Trophy, FileBarChart,
  Sun, Moon, Sparkles, LogOut, Settings, User, ChevronUp,
  ShieldCheck, Zap, Mic, Target,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase";

interface NavItem { href: Route; label: string; icon: LucideIcon; }
interface NavGroup { label: string; items: NavItem[]; }

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard",  label: "Dashboard",     icon: LayoutDashboard },
      { href: "/analytics",  label: "Analytics",     icon: BarChart2 },
      { href: "/reports",    label: "Reports",       icon: FileBarChart },
      { href: "/roi",        label: "ROI Dashboard", icon: Target },
    ],
  },
  {
    label: "Automation",
    items: [
      { href: "/workflows",           label: "Workflows",    icon: Workflow },
      { href: "/workflows/wizard",    label: "Smart Wizard", icon: Zap },
      { href: "/agents",              label: "AI Agents",    icon: Mic },
      { href: "/workflows/templates", label: "Templates",    icon: Sparkles },
      { href: "/monitoring",          label: "Call Monitor", icon: Activity },
      { href: "/webhooks",            label: "Webhooks",     icon: Webhook },
    ],
  },
  {
    label: "CRM",
    items: [
      { href: "/leads",        label: "Leads",        icon: Users },
      { href: "/contacts",     label: "Contacts",     icon: Users },
      { href: "/lead-scoring", label: "Lead Scoring", icon: TrendingUp },
      { href: "/appointments", label: "Appointments", icon: CalendarCheck },
      { href: "/dnc",          label: "DNC List",     icon: ShieldOff },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/campaigns",         label: "Campaigns",        icon: Megaphone },
      { href: "/calls",             label: "Calls",            icon: PhoneCall },
      { href: "/agent-performance", label: "Leaderboard",      icon: Trophy },
      { href: "/notifications",     label: "Notifications",    icon: Bell },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/integrations", label: "Integrations", icon: Plug },
      { href: "/audit-logs",   label: "Audit Logs",   icon: Shield },
    ],
  },
];

interface Props { children: React.ReactNode; }

export function DashboardShell({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [userEmail, setUserEmail] = useState("");
  const [userRole, setUserRole] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? "");
    });
    supabase.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token;
      if (!token) return;
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/admin/approvals/me/status`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const { role } = await res.json();
          setUserRole(role ?? "");
        }
      } catch {}
    });
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  const initials = userEmail ? userEmail[0].toUpperCase() : "U";
  const roleLabel: Record<string, string> = {
    super_admin: "Superadmin",
    tenant_admin: "Reseller",
    manager: "Manager",
    agent: "Client",
    viewer: "Viewer",
  };
  const isSuperAdmin = userRole === "super_admin";
  const isReseller = userRole === "tenant_admin";

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      <aside className="w-60 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0">

        {/* Logo */}
        <div className="px-4 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div>
            <span className="font-bold text-slate-800 dark:text-slate-100 text-lg tracking-tight">VoiceOps</span>
            <span className="ml-1.5 text-[10px] font-semibold bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded-full align-middle">AI</span>
          </div>
          <button onClick={toggleTheme}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>

                {/* Nav */}
        <nav className="flex-1 px-2 py-3 overflow-y-auto min-h-0">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-4">
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {group.label}
              </p>

              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active =
                    pathname === item.href ||
                    pathname.startsWith(item.href + "/");

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                        active
                          ? "bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-medium"
                          : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200"
                      }`}
                    >
                      <item.icon
                        className={`w-4 h-4 shrink-0 ${
                          active
                            ? "text-indigo-600 dark:text-indigo-400"
                            : "text-slate-400"
                        }`}
                      />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Role-based admin section */}
          {(isSuperAdmin || isReseller) && (
            <div className="px-2 pb-2 border-t border-slate-100 dark:border-slate-800 pt-2 shrink-0">
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {isSuperAdmin ? "Superadmin" : "My Account"}
              </p>

              <Link
                href="/superadmin/users"
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  pathname.startsWith("/superadmin/users")
                    ? "bg-indigo-50 dark:bg-indigo-950 text-indigo-700 font-medium"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <Users className="w-4 h-4 shrink-0 text-slate-400" />
                {isSuperAdmin ? "Manage Users" : "My Clients"}
              </Link>

              {isSuperAdmin && (
                <Link
                  href="/superadmin/approvals"
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                    pathname.startsWith("/superadmin/approvals")
                      ? "bg-indigo-50 dark:bg-indigo-950 text-indigo-700 font-medium"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  <ShieldCheck className="w-4 h-4 shrink-0 text-slate-400" />
                  User Approvals
                </Link>
              )}
            </div>
          )}

          {/* Setup wizard */}
          <Link
            href="/onboarding"
            className="m-2 flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950 dark:to-blue-950 text-indigo-700 dark:text-indigo-300 hover:opacity-80 transition-opacity shrink-0"
          >
            <Sparkles className="w-4 h-4" />
            Setup wizard
          </Link>

          {/* User menu */}
          <div
            className="relative border-t border-slate-100 dark:border-slate-800 shrink-0"
            ref={menuRef}
          >
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                {initials}
              </div>

              <div className="flex-1 text-left min-w-0">
                <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
                  {userEmail}
                </p>
                <p className="text-[10px] text-slate-400">
                  {roleLabel[userRole] ?? "User"}
                </p>
              </div>

              <ChevronUp
                className={`w-4 h-4 text-slate-400 transition-transform ${
                  menuOpen ? "" : "rotate-180"
                }`}
              />
            </button>

            {menuOpen && (
              <div className="absolute bottom-full left-2 right-2 mb-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden z-50">
                <Link
                  href="/integrations"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </Link>

                <Link
                  href="/onboarding"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <User className="w-4 h-4" />
                  Profile / Setup
                </Link>

                <div className="border-t border-slate-100 dark:border-slate-800" />

                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-6">
          {children}
        </div>
      </main>
