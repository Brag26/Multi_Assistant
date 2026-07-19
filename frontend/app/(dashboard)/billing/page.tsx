"use client";

import { useEffect, useState, useCallback } from "react";
import Script from "next/script";
import { CreditCard, Smartphone, Zap, TrendingUp, Building2, Users, Pencil, Check, X, Plus } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSessionStore } from "@/store/session";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import {
  listPlans, getMySubscription, createCheckout, verifyRazorpayPayment,
  adminListAccounts, adminListPlans, adminUpdatePlan, adminAssignPlan,
  listAddons, adminListAddons, adminUpdateAddon, createAddonCheckout,
  type PlanInfo, type Subscription, type BillingPlanId, type AdminAccount, type AddonInfo,
} from "@/lib/api-billing";

declare global {
  interface Window { Razorpay: any; }
}

const PLAN_ICONS: Record<BillingPlanId, typeof Zap> = {
  starter: Zap, growth: TrendingUp, pro: TrendingUp, enterprise: Building2,
};

/** Fetches the current user's role the same way the dashboard shell does. */
function useUserRole() {
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token;
      if (!token) { setRole(""); return; }
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/approvals/me/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const { role } = await res.json();
          setRole(role ?? "");
        } else {
          setRole("");
        }
      } catch {
        setRole("");
      }
    });
  }, []);
  return role; // null = still loading, "" = unknown/unauthenticated
}

export default function BillingPage() {
  const role = useUserRole();
  return (
    <DashboardShell>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      <div style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div className="mb-6">
          <p className="text-sm font-medium text-indigo-600">Account</p>
          <h1 className="text-2xl font-bold text-slate-800">Billing & Usage</h1>
        </div>
        {role === null ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : role === "super_admin" ? (
          <AdminBillingView />
        ) : (
          <ClientBillingView />
        )}
      </div>
    </DashboardShell>
  );
}

// ── Reseller / Client view — pick a plan, pay for it ─────────────────────────

function ClientBillingView() {
  const tenantId = useSessionStore((s) => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [addons, setAddons] = useState<AddonInfo[]>([]);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!tenantId) {
        const [planList, addonList] = await Promise.all([listPlans(), listAddons()]);
        setPlans(planList);
        setAddons(addonList);
        setSub(null);
        return;
      }
      const [planList, addonList, me] = await Promise.all([listPlans(), listAddons(), getMySubscription(tenantId)]);
      setPlans(planList);
      setAddons(addonList);
      setSub(me.subscription);
    } catch (err: any) {
      setError(err?.message || "Couldn't load billing info. Is the backend deployed and reachable?");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleRazorpay(plan: BillingPlanId) {
    if (!tenantId) return;
    setPaying(plan);
    try {
      const checkout = await createCheckout(tenantId, plan, "razorpay");
      if (checkout.gateway !== "razorpay") return;
      const rzp = new window.Razorpay({
        key: checkout.key_id,
        amount: checkout.amount,
        currency: checkout.currency,
        order_id: checkout.order_id,
        name: "Volant",
        description: `${plan} plan subscription`,
        method: { upi: true, card: true, netbanking: true, wallet: false },
        handler: async (response: any) => {
          await verifyRazorpayPayment(tenantId, response.razorpay_order_id, response.razorpay_payment_id, response.razorpay_signature);
          await refresh();
        },
        theme: { color: "#6366f1" },
      });
      rzp.open();
    } finally {
      setPaying(null);
    }
  }

  async function handleStripe(plan: BillingPlanId) {
    if (!tenantId) return;
    setPaying(plan);
    try {
      const checkout = await createCheckout(tenantId, plan, "stripe");
      if (checkout.gateway === "stripe") window.location.href = checkout.checkout_url;
    } finally {
      setPaying(null);
    }
  }

  async function handleAddonRazorpay(key: string) {
    if (!tenantId) return;
    setPaying(`addon:${key}`);
    try {
      const checkout = await createAddonCheckout(tenantId, key, "razorpay");
      if (checkout.gateway !== "razorpay" || !checkout.order_id) return;
      const rzp = new window.Razorpay({
        key: checkout.key_id,
        amount: checkout.amount,
        currency: checkout.currency,
        order_id: checkout.order_id,
        name: "Volant",
        description: "Extra minutes top-up",
        method: { upi: true, card: true, netbanking: true, wallet: false },
        handler: async (response: any) => {
          await verifyRazorpayPayment(tenantId, response.razorpay_order_id, response.razorpay_payment_id, response.razorpay_signature);
          await refresh();
        },
        theme: { color: "#6366f1" },
      });
      rzp.open();
    } finally {
      setPaying(null);
    }
  }

  async function handleAddonStripe(key: string) {
    if (!tenantId) return;
    setPaying(`addon:${key}`);
    try {
      const checkout = await createAddonCheckout(tenantId, key, "stripe");
      if (checkout.gateway === "stripe" && checkout.checkout_url) window.location.href = checkout.checkout_url;
    } finally {
      setPaying(null);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (error) return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
      {error}
      <button onClick={refresh} className="ml-2 underline font-medium">Retry</button>
    </div>
  );

  return (
    <>
      <Card className="mb-8">
        <CardHeader><h2 className="font-semibold text-slate-800">Current Plan</h2></CardHeader>
        <CardContent>
          {sub ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-lg font-bold text-slate-800">{sub.plan_name}</span>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${sub.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                  {sub.status}
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5 mb-2">
                <div className={`h-2.5 rounded-full ${sub.usage_pct >= 80 ? "bg-amber-500" : "bg-indigo-600"}`} style={{ width: `${Math.min(sub.usage_pct, 100)}%` }} />
              </div>
              <p className="text-sm text-slate-500">
                {sub.minutes_used} / {sub.minutes_limit} minutes used
                {sub.renewal_date && ` · renews ${new Date(sub.renewal_date).toLocaleDateString()}`}
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No active subscription yet — pick a plan below.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {plans.map((p) => {
          const Icon = PLAN_ICONS[p.plan];
          const isCurrent = sub?.plan === p.plan && sub?.status === "active";
          const unpriced = p.price_inr === null;
          return (
            <Card key={p.plan} className={isCurrent ? "border-indigo-400 ring-1 ring-indigo-200" : ""}>
              <CardHeader className="flex flex-col gap-1">
                <Icon className="w-5 h-5 text-indigo-600" />
                <h3 className="font-semibold text-slate-800">{p.name}</h3>
                <p className="text-xs text-slate-500">{p.description}</p>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  {!unpriced ? (
                    <><span className="text-2xl font-bold text-slate-800">₹{p.price_inr}</span><span className="text-sm text-slate-500">/month</span></>
                  ) : (
                    <span className="text-lg font-semibold text-slate-800">Custom</span>
                  )}
                  <p className="text-xs text-slate-500 mt-1">
                    {p.minutes_limit ? `${p.minutes_limit} minutes/month` : "Volume set by your admin"}
                  </p>
                </div>

                {isCurrent ? (
                  <Button variant="outline" className="w-full" disabled>Current Plan</Button>
                ) : unpriced ? (
                  <Button variant="outline" className="w-full" disabled>Ask your admin to enable this</Button>
                ) : (
                  <div className="space-y-2">
                    <Button className="w-full gap-2" disabled={paying === p.plan} onClick={() => handleRazorpay(p.plan)}>
                      <Smartphone className="w-4 h-4" /> Pay with GPay / UPI
                    </Button>
                    <Button variant="outline" className="w-full gap-2" disabled={paying === p.plan} onClick={() => handleStripe(p.plan)}>
                      <CreditCard className="w-4 h-4" /> Pay with Card (Stripe)
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {sub && addons.length > 0 && (
        <div className="mt-8">
          <h2 className="font-semibold text-slate-800 mb-3 flex items-center gap-2"><Plus className="w-4 h-4" /> Add-ons</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {addons.map((a) => (
              <Card key={a.key}>
                <CardHeader><h3 className="font-semibold text-slate-800">{a.name}</h3></CardHeader>
                <CardContent>
                  <p className="text-xs text-slate-500 mb-3">{a.description}</p>
                  <p className="text-xl font-bold text-slate-800 mb-3">₹{a.price_inr} <span className="text-sm font-normal text-slate-500">for +{a.minutes} min</span></p>
                  <div className="space-y-2">
                    <Button className="w-full gap-2" disabled={paying === `addon:${a.key}`} onClick={() => handleAddonRazorpay(a.key)}>
                      <Smartphone className="w-4 h-4" /> Pay with GPay / UPI
                    </Button>
                    <Button variant="outline" className="w-full gap-2" disabled={paying === `addon:${a.key}`} onClick={() => handleAddonStripe(a.key)}>
                      <CreditCard className="w-4 h-4" /> Pay with Card
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ── Superadmin view — edit plan pricing, assign plans to accounts free ──────

function AdminBillingView() {
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [addons, setAddons] = useState<AddonInfo[]>([]);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState<BillingPlanId | null>(null);
  const [editDraft, setEditDraft] = useState<{ price_inr: string; minutes_limit: string; description: string }>({ price_inr: "", minutes_limit: "", description: "" });
  const [editingAddon, setEditingAddon] = useState<string | null>(null);
  const [addonDraft, setAddonDraft] = useState<{ price_inr: string; minutes: string; description: string }>({ price_inr: "", minutes: "", description: "" });
  const [assigning, setAssigning] = useState<AdminAccount | null>(null);
  const [assignPlan, setAssignPlan] = useState<BillingPlanId>("starter");
  const [assignMinutes, setAssignMinutes] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [planList, addonList, accountList] = await Promise.all([adminListPlans(), adminListAddons(), adminListAccounts()]);
      setPlans(planList);
      setAddons(addonList);
      setAccounts(accountList);
    } catch (err: any) {
      setError(err?.message || "Couldn't load billing admin data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  function startEdit(p: PlanInfo) {
    setEditingPlan(p.plan);
    setEditDraft({
      price_inr: p.price_inr?.toString() ?? "",
      minutes_limit: p.minutes_limit?.toString() ?? "",
      description: p.description,
    });
  }

  async function saveEdit(plan: BillingPlanId) {
    setSaving(true);
    try {
      await adminUpdatePlan(plan, {
        price_inr: editDraft.price_inr === "" ? undefined : Number(editDraft.price_inr),
        minutes_limit: editDraft.minutes_limit === "" ? undefined : Number(editDraft.minutes_limit),
        description: editDraft.description,
      });
      setEditingPlan(null);
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  function openAssign(acct: AdminAccount) {
    setAssigning(acct);
    setAssignPlan(acct.subscription?.plan ?? "starter");
    setAssignMinutes(acct.subscription?.minutes_limit?.toString() ?? "");
  }

  async function submitAssign() {
    if (!assigning) return;
    setSaving(true);
    try {
      await adminAssignPlan(assigning.user_id, assignPlan, assignMinutes === "" ? undefined : Number(assignMinutes));
      setAssigning(null);
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (error) return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
      {error}
      <button onClick={refresh} className="ml-2 underline font-medium">Retry</button>
    </div>
  );

  return (
    <div className="space-y-10">
      {/* Plan pricing editor */}
      <section>
        <h2 className="font-semibold text-slate-800 mb-3">Plan Pricing</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {plans.map((p) => {
            const Icon = PLAN_ICONS[p.plan];
            const isEditing = editingPlan === p.plan;
            return (
              <Card key={p.plan}>
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <Icon className="w-5 h-5 text-indigo-600" />
                    <h3 className="font-semibold text-slate-800">{p.name}</h3>
                  </div>
                  {!isEditing && (
                    <button onClick={() => startEdit(p)} className="text-slate-400 hover:text-indigo-600">
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                </CardHeader>
                <CardContent>
                  {isEditing ? (
                    <div className="space-y-2">
                      <label className="block text-xs text-slate-500">Price (₹/month, blank = custom)</label>
                      <Input value={editDraft.price_inr} onChange={(e) => setEditDraft((d) => ({ ...d, price_inr: e.target.value }))} placeholder="e.g. 999" />
                      <label className="block text-xs text-slate-500">Minutes/month (blank = custom)</label>
                      <Input value={editDraft.minutes_limit} onChange={(e) => setEditDraft((d) => ({ ...d, minutes_limit: e.target.value }))} placeholder="e.g. 60" />
                      <label className="block text-xs text-slate-500">Description</label>
                      <Input value={editDraft.description} onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))} />
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" className="flex-1 gap-1" disabled={saving} onClick={() => saveEdit(p.plan)}>
                          <Check className="w-3.5 h-3.5" /> Save
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => setEditingPlan(null)}>
                          <X className="w-3.5 h-3.5" /> Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-slate-500 mb-2">{p.description}</p>
                      <p className="text-xl font-bold text-slate-800">{p.price_inr !== null ? `₹${p.price_inr}/mo` : "Custom"}</p>
                      <p className="text-xs text-slate-500">{p.minutes_limit ? `${p.minutes_limit} minutes/month` : "Custom volume"}</p>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Accounts — assign plans without payment */}
      <section>
        <h2 className="font-semibold text-slate-800 mb-3 flex items-center gap-2"><Users className="w-4 h-4" /> Resellers & Clients</h2>
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                  <th className="px-4 py-2 font-medium">Account</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Plan</th>
                  <th className="px-4 py-2 font-medium">Usage</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.user_id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-slate-800">{a.display_name || a.email}</p>
                      <p className="text-xs text-slate-400">{a.email}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {a.role === "tenant_admin" ? "Reseller" : "Client"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 capitalize">{a.subscription?.plan ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {a.subscription ? `${a.subscription.minutes_used}/${a.subscription.minutes_limit} min` : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {a.subscription ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${a.subscription.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                          {a.subscription.status}
                        </span>
                      ) : <span className="text-xs text-slate-400">No plan</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button size="sm" variant="outline" onClick={() => openAssign(a)}>
                        {a.subscription ? "Change Plan" : "Assign Plan"}
                      </Button>
                    </td>
                  </tr>
                ))}
                {accounts.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No resellers or clients yet.</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {/* Assign modal */}
      {assigning && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setAssigning(null)}>
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardHeader><h3 className="font-semibold">Assign Plan — {assigning.display_name || assigning.email}</h3></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Plan</label>
                <select
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                  value={assignPlan}
                  onChange={(e) => setAssignPlan(e.target.value as BillingPlanId)}
                >
                  {plans.map((p) => <option key={p.plan} value={p.plan}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Minutes/month (leave blank to use plan default)</label>
                <Input value={assignMinutes} onChange={(e) => setAssignMinutes(e.target.value)} placeholder="e.g. 500" />
              </div>
              <p className="text-xs text-slate-400">No payment is charged — this grants the plan directly, free of cost.</p>
              <div className="flex gap-2 pt-1">
                <Button className="flex-1" disabled={saving} onClick={submitAssign}>Assign</Button>
                <Button variant="outline" className="flex-1" onClick={() => setAssigning(null)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
