// lib/api-billing.ts — plans, subscription status, Stripe + Razorpay checkout
import { apiFetch } from "./api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

export type BillingPlanId = "starter" | "growth" | "pro" | "enterprise";
export type PaymentGatewayId = "stripe" | "razorpay";

export interface PlanInfo {
  plan: BillingPlanId;
  name: string;
  price_inr: number | null;
  minutes_limit: number | null;
  description: string;
}

export interface Subscription {
  id: string;
  plan: BillingPlanId;
  plan_name: string;
  status: "trialing" | "active" | "past_due" | "canceled" | "expired";
  minutes_limit: number;
  minutes_used: number;
  minutes_remaining: number;
  usage_pct: number;
  renewal_date: string | null;
  gateway: PaymentGatewayId | null;
}

export interface MySubscriptionResponse {
  subscription: Subscription | null;
  plans?: PlanInfo[];
}

// Public — no auth required, safe for the /pricing page
export const listPlans = () => fetch(`${API_URL}/billing/plans`).then((r) => r.json()) as Promise<PlanInfo[]>;

export const getMySubscription = (tid: string) => apiFetch<MySubscriptionResponse>(`/tenants/${tid}/billing/me`);

export interface RazorpayCheckout {
  gateway: "razorpay";
  order_id: string;
  amount: number;
  currency: string;
  key_id: string;
  payment_row_id: string;
}
export interface StripeCheckout {
  gateway: "stripe";
  checkout_url: string;
  session_id: string;
  payment_row_id: string;
}

export const createCheckout = (tid: string, plan: BillingPlanId, gateway: PaymentGatewayId) =>
  apiFetch<RazorpayCheckout | StripeCheckout>(`/tenants/${tid}/billing/checkout`, {
    method: "POST",
    body: JSON.stringify({ plan, gateway }),
  });

export const verifyRazorpayPayment = (tid: string, order_id: string, payment_id: string, signature: string) =>
  apiFetch<{ ok: boolean }>(`/tenants/${tid}/billing/checkout/razorpay/verify`, {
    method: "POST",
    body: JSON.stringify({ order_id, payment_id, signature }),
  });
