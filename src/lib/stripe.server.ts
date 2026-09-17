import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

import type { Database } from "@/integrations/supabase/types";

export type BillingTier = "tier1" | "tier2";

export const TIER_TO_PRICE_ID: Record<BillingTier, string> = {
  tier1: process.env.STRIPE_PRICE_TIER1 ?? "",
  tier2: process.env.STRIPE_PRICE_TIER2 ?? "",
};

function getSupabaseConfig(): {
  url: string;
  publishableKey: string;
  serviceRoleKey: string;
} {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const publishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !publishableKey || !serviceRoleKey) {
    const missing = [
      ...(!url ? ["SUPABASE_URL (or VITE_SUPABASE_URL)"] : []),
      ...(!publishableKey ? ["SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY)"] : []),
      ...(!serviceRoleKey ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
    ];
    throw new Error(`Missing Supabase config: ${missing.join(", ")}`);
  }

  return { url, publishableKey, serviceRoleKey };
}

async function getValidatedTokenFromRequest(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  const fallbackToken = request.headers.get("x-supabase-access-token")?.trim() ?? null;
  const token = bearerToken || fallbackToken;
  if (!token) return null;

  try {
    const { url, publishableKey } = getSupabaseConfig();
    const client = createClient<Database>(url, publishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user?.id) return null;
    return token;
  } catch {
    return null;
  }
}

async function getAuthenticatedUser(request: Request): Promise<{ userId: string; token: string }> {
  const token = await getValidatedTokenFromRequest(request);
  if (!token) {
    throw new Error("Unauthorized: valid Supabase session required");
  }

  const { url, publishableKey } = getSupabaseConfig();
  const client = createClient<Database>(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user?.id) {
    throw new Error("Unauthorized: valid Supabase session required");
  }

  return { userId: data.user.id, token };
}

let _stripeClient: Stripe | undefined;

export function getStripeClient(): Stripe {
  if (_stripeClient) return _stripeClient;

  const secretKey = process.env.STRIPE_SECRET_KEY ?? process.env.VITE_STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY (or VITE_STRIPE_SECRET_KEY)");
  }

  _stripeClient = new Stripe(secretKey);
  return _stripeClient;
}

let _serviceRoleClient: ReturnType<typeof createClient<Database>> | undefined;

export function getServiceRoleClient(): ReturnType<typeof createClient<Database>> {
  if (_serviceRoleClient) return _serviceRoleClient;

  const { url, serviceRoleKey } = getSupabaseConfig();
  _serviceRoleClient = createClient<Database>(url, serviceRoleKey, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return _serviceRoleClient;
}

export function getTierFromPriceId(priceId: string | null | undefined): BillingTier | null {
  if (!priceId) return null;

  const match = Object.entries(TIER_TO_PRICE_ID).find(([, configuredPriceId]) => configuredPriceId === priceId);
  return (match?.[0] as BillingTier | undefined) ?? null;
}

async function getCurrentProfileTier(userId: string): Promise<string> {
  const { data, error } = await getServiceRoleClient()
    .from("profiles")
    .select("tier")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error("Unable to load current profile");
  return data?.tier ?? "free";
}

async function ensureStripeCustomer(userId: string): Promise<string> {
  const serviceRole = getServiceRoleClient();
  const { data: profileData, error: profileError } = await serviceRole
    .from("profiles")
    .select("tier, stripe_customer_id, stripe_subscription_id")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    throw new Error("Unable to load billing profile");
  }

  if (profileData?.stripe_customer_id) {
    return profileData.stripe_customer_id;
  }

  const { data: authUser, error: authUserError } = await serviceRole.auth.admin.getUserById(userId);
  if (authUserError || !authUser.user?.email) {
    throw new Error("Unable to create Stripe customer for this user");
  }

  const stripe = getStripeClient();
  const customer = await stripe.customers.create({
    email: authUser.user.email,
    metadata: { user_id: userId },
  });

  await serviceRole.rpc("set_user_tier", {
    p_user_id: userId,
    p_tier: profileData?.tier ?? "free",
    p_stripe_customer_id: customer.id,
    p_stripe_subscription_id: profileData?.stripe_subscription_id ?? null,
  });

  return customer.id;
}

export async function createCheckoutSessionServer(data: { tier: BillingTier }) {
  const request = getRequest();
  if (!request) {
    throw new Error("Request context unavailable");
  }

  const { userId } = await getAuthenticatedUser(request);
  const priceId = TIER_TO_PRICE_ID[data.tier];
  if (!priceId) {
    throw new Error(`Missing Stripe price for tier: ${data.tier}`);
  }

  const customerId = await ensureStripeCustomer(userId);
  const origin = new URL(request.url).origin;
  const stripe = getStripeClient();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: {
      user_id: userId,
      tier: data.tier,
    },
    success_url: `${origin}/pricing?checkout=success`,
    cancel_url: `${origin}/pricing?checkout=cancelled`,
  });

  if (!session.url) {
    throw new Error("Stripe checkout session URL was not returned");
  }

  return { url: session.url };
}

export async function createPortalSessionServer(_data: Record<string, never> = {}) {
  const request = getRequest();
  if (!request) {
    throw new Error("Request context unavailable");
  }

  const { userId } = await getAuthenticatedUser(request);
  const { data: profileData, error } = await getServiceRoleClient()
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();

  if (error || !profileData?.stripe_customer_id) {
    throw new Error("No Stripe customer is attached to this account");
  }

  const origin = new URL(request.url).origin;
  const stripe = getStripeClient();
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: profileData.stripe_customer_id,
    return_url: `${origin}/pricing`,
  });

  return { url: portalSession.url };
}

export async function syncTierFromStripeSubscription(
  customerId: string,
  subscriptionId: string,
  tierOverride?: BillingTier,
): Promise<void> {
  const serviceRole = getServiceRoleClient();
  const { data: profile, error } = await serviceRole
    .from("profiles")
    .select("id, tier")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (error || !profile?.id) return;

  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price"],
  });

  const priceId = subscription.items.data[0]?.price.id ?? null;
  const resolvedTier = tierOverride ?? getTierFromPriceId(priceId) ?? "free";

  if (subscription.status === "active" || subscription.status === "trialing") {
    await serviceRole.rpc("set_user_tier", {
      p_user_id: profile.id,
      p_tier: resolvedTier,
      p_stripe_customer_id: customerId,
      p_stripe_subscription_id: subscription.id,
    });
    return;
  }

  await serviceRole.rpc("set_user_tier", {
    p_user_id: profile.id,
    p_tier: "free",
    p_stripe_customer_id: customerId,
    p_stripe_subscription_id: null,
  });
}

export async function getCurrentTierSummary(userId: string): Promise<{ tier: string; remaining: number; limit: number }> {
  const { data: profile } = await getServiceRoleClient()
    .from("profiles")
    .select("tier")
    .eq("id", userId)
    .maybeSingle();

  const tier = profile?.tier ?? "free";
  const limit = resolveTierLimit(tier);
  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await getServiceRoleClient()
    .from("ai_usage_user_daily")
    .select("points_used")
    .eq("user_id", userId)
    .eq("date", today)
    .maybeSingle();

  const pointsUsed = Number(usage?.points_used ?? 0);
  return {
    tier,
    remaining: Math.max(0, limit - pointsUsed),
    limit,
  };
}

export function resolveTierLimit(tier: string): number {
  const TIER_LIMITS: Record<string, number> = {
    free: 40,
    tier1: 80,
    tier2: 160,
  };

  return TIER_LIMITS[tier] ?? TIER_LIMITS.free;
}
