"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Zap, TrendingUp, Building2 } from "lucide-react";
import { listPlans, type PlanInfo, type BillingPlanId } from "@/lib/api-billing";

const PLAN_ICONS: Record<BillingPlanId, typeof Zap> = {
  starter: Zap, growth: TrendingUp, pro: TrendingUp, enterprise: Building2,
};

const PLAN_FEATURES: Record<BillingPlanId, string[]> = {
  starter: ["AI voice calling", "1 workflow", "Basic analytics", "Email support"],
  growth: ["Everything in Starter", "Unlimited workflows", "Campaign automation", "Priority support"],
  pro: ["Everything in Growth", "Lead scoring & CRM", "Custom integrations", "Dedicated support"],
  enterprise: ["Everything in Pro", "Custom minute volume", "SLA & onboarding", "Dedicated account manager"],
};

export default function PricingPage() {
  const [plans, setPlans] = useState<PlanInfo[]>([]);

  useEffect(() => { listPlans().then(setPlans); }, []);

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif" }} className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="font-bold text-slate-800 text-lg">
            VoiceOps <span className="ml-1 text-[10px] font-semibold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full align-middle">AI</span>
          </span>
          <Link href="/login" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">Sign in</Link>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-6 py-16 text-center">
        <h1 className="text-4xl font-bold text-slate-900 mb-3">Simple, minute-based pricing</h1>
        <p className="text-slate-500 max-w-xl mx-auto">
          Pay only for the AI voice minutes you use. Upgrade, downgrade, or cancel any time.
        </p>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-24 grid grid-cols-1 md:grid-cols-4 gap-6">
        {plans.map((p) => {
          const Icon = PLAN_ICONS[p.plan];
          const featured = p.plan === "growth";
          return (
            <div key={p.plan}
              className={`rounded-2xl border p-6 bg-white flex flex-col ${
                featured ? "border-indigo-400 ring-2 ring-indigo-100 shadow-lg" : "border-slate-200 shadow-sm"
              }`}>
              {featured && (
                <span className="self-start mb-3 text-[10px] font-semibold bg-indigo-600 text-white px-2 py-1 rounded-full">
                  MOST POPULAR
                </span>
              )}
              <Icon className="w-6 h-6 text-indigo-600 mb-2" />
              <h3 className="text-lg font-bold text-slate-800">{p.name}</h3>
              <div className="my-4">
                {p.price_inr !== null ? (
                  <>
                    <span className="text-3xl font-bold text-slate-900">₹{p.price_inr}</span>
                    <span className="text-sm text-slate-500">/month</span>
                  </>
                ) : (
                  <span className="text-2xl font-bold text-slate-900">Custom</span>
                )}
                <p className="text-xs text-slate-500 mt-1">
                  {p.minutes_limit ? `${p.minutes_limit} minutes/month` : "Unlimited / custom volume"}
                </p>
              </div>
              <ul className="space-y-2 mb-6 flex-1">
                {PLAN_FEATURES[p.plan].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /> {f}
                  </li>
                ))}
              </ul>
              <Link
                href={p.plan === "enterprise" ? "mailto:sales@voiceops.ai" as any : "/signup"}
                className={`text-center text-sm font-medium rounded-lg py-2.5 transition-colors ${
                  featured ? "bg-indigo-600 text-white hover:bg-indigo-700" : "border border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}>
                {p.plan === "enterprise" ? "Contact Sales" : "Get Started"}
              </Link>
            </div>
          );
        })}
      </section>
    </div>
  );
}
