"use client";

import { useEffect, useState, useCallback } from "react";
import Script from "next/script";
import { CreditCard, Smartphone, Zap, TrendingUp, Building2 } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/store/session";
import {
  listPlans, getMySubscription, createCheckout, verifyRazorpayPayment,
  type PlanInfo, type Subscription, type BillingPlanId,
} from "@/lib/api-billing";

declare global {
  interface Window { Razorpay: any; }
}

const PLAN_ICONS: Record<BillingPlanId, typeof Zap> = {
  starter: Zap, growth: TrendingUp, pro: TrendingUp, enterprise: Building2,
};

export default function BillingPage() {
  const tenantId = useSessionStore((s) => s.tenantId);
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    const [planList, me] = await Promise.all([listPlans(), getMySubscription(tenantId)]);
    setPlans(planList);
    setSub(me.subscription);
    setLoading(false);
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
        name: "VoiceOps",
        description: `${plan} plan subscription`,
        method: { upi: true, card: true, netbanking: true, wallet: false },
        handler: async (response: any) => {
          await verifyRazorpayPayment(
            tenantId,
            response.razorpay_order_id,
            response.razorpay_payment_id,
            response.razorpay_signature,
          );
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

  return (
    <DashboardShell>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      <div style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div className="mb-6">
          <p className="text-sm font-medium text-indigo-600">Account</p>
          <h1 className="text-2xl font-bold text-slate-800">Billing & Usage</h1>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <>
            {/* Current usage */}
            <Card className="mb-8">
              <CardHeader>
                <h2 className="font-semibold text-slate-800">Current Plan</h2>
              </CardHeader>
              <CardContent>
                {sub ? (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-lg font-bold text-slate-800">{sub.plan_name}</span>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                        sub.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                      }`}>{sub.status}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5 mb-2">
                      <div
                        className={`h-2.5 rounded-full ${sub.usage_pct >= 80 ? "bg-amber-500" : "bg-indigo-600"}`}
                        style={{ width: `${Math.min(sub.usage_pct, 100)}%` }}
                      />
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

            {/* Plans */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {plans.map((p) => {
                const Icon = PLAN_ICONS[p.plan];
                const isCurrent = sub?.plan === p.plan && sub?.status === "active";
                return (
                  <Card key={p.plan} className={isCurrent ? "border-indigo-400 ring-1 ring-indigo-200" : ""}>
                    <CardHeader className="flex flex-col gap-1">
                      <Icon className="w-5 h-5 text-indigo-600" />
                      <h3 className="font-semibold text-slate-800">{p.name}</h3>
                      <p className="text-xs text-slate-500">{p.description}</p>
                    </CardHeader>
                    <CardContent>
                      <div className="mb-4">
                        {p.price_inr !== null ? (
                          <>
                            <span className="text-2xl font-bold text-slate-800">₹{p.price_inr}</span>
                            <span className="text-sm text-slate-500">/month</span>
                          </>
                        ) : (
                          <span className="text-lg font-semibold text-slate-800">Custom</span>
                        )}
                        <p className="text-xs text-slate-500 mt-1">
                          {p.minutes_limit ? `${p.minutes_limit} minutes/month` : "Unlimited / custom volume"}
                        </p>
                      </div>

                      {p.plan === "enterprise" ? (
                        <Button variant="outline" className="w-full" onClick={() => (window.location.href = "mailto:sales@voiceops.ai")}>
                          Contact Sales
                        </Button>
                      ) : isCurrent ? (
                        <Button variant="outline" className="w-full" disabled>Current Plan</Button>
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
          </>
        )}
      </div>
    </DashboardShell>
  );
}
