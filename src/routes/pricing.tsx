import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { TIER_LIMITS } from "@/lib/tiers";
import { createCheckoutSession } from "@/lib/billing.functions";

const PLAN_DEFS = [
  { key: "free", label: "Free", price: "$0", description: "Best for trying the workflow.", limit: TIER_LIMITS.free },
  { key: "tier1", label: "Tier 1", price: "$9/mo", description: "More daily AI budget for heavier prep sessions.", limit: TIER_LIMITS.tier1, featured: true },
  { key: "tier2", label: "Tier 2", price: "$19/mo", description: "High-volume prep for interview-heavy schedules.", limit: TIER_LIMITS.tier2 },
] as const;

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — PrepPilotX" },
      {
        name: "description",
        content: "Upgrade your PrepPilotX plan for more daily AI usage and subscription management.",
      },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  const navigate = useNavigate();
  const [sessionReady, setSessionReady] = useState(false);
  const [currentTier, setCurrentTier] = useState("free");
  const [loadingTier, setLoadingTier] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!active) return;

      setSessionReady(true);
      if (!user) {
        setCurrentTier("free");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("tier")
        .eq("id", user.id)
        .maybeSingle();

      if (!active) return;
      setCurrentTier(profile?.tier ?? "free");
    }

    loadSession();
    return () => {
      active = false;
    };
  }, []);

  async function handleSubscribe(tier: "tier1" | "tier2") {
    if (!sessionReady) return;

    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      navigate({ to: "/auth", search: { next: "/pricing" } });
      return;
    }

    try {
      setLoadingTier(tier);
      const result = await createCheckoutSession({ data: { tier } });
      if (result?.url) {
        window.location.assign(result.url);
      }
    } finally {
      setLoadingTier(null);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="text-center">
        <p className="eyebrow">Pricing</p>
        <h1 className="display-2 mt-2">Choose the right daily AI limit</h1>
        <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
          Keep the free tier for light prep, or upgrade when your interview schedule gets heavier.
        </p>
      </header>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        {PLAN_DEFS.map((plan) => {
          const isCurrent = plan.key === currentTier;
          const canSubscribe = plan.key !== "free" && currentTier !== plan.key;

          return (
            <article
              key={plan.key}
              className={`rounded-2xl border p-6 ${plan.featured ? "border-blue-500 bg-blue-500/5" : "border-border bg-background/60"}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">{plan.label}</p>
                  <h2 className="mt-2 text-3xl font-semibold">{plan.price}</h2>
                </div>
                {isCurrent && (
                  <span className="rounded-full border border-emerald-500 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
                    Current
                  </span>
                )}
              </div>

              <p className="mt-4 text-sm text-muted-foreground">{plan.description}</p>

              <div className="mt-5 rounded-xl border border-border bg-background/70 p-3 text-sm">
                <div className="font-medium">Daily AI points</div>
                <div className="mt-1 text-2xl font-semibold">{plan.limit}</div>
              </div>

              <div className="mt-6">
                {plan.key === "free" ? (
                  <Button type="button" variant="secondary" className="w-full" disabled>
                    Included with your account
                  </Button>
                ) : (
                  <Button
                    type="button"
                    className="w-full"
                    disabled={!canSubscribe || loadingTier !== null}
                    onClick={() => handleSubscribe(plan.key)}
                  >
                    {loadingTier === plan.key ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Redirecting...
                      </>
                    ) : canSubscribe ? (
                      "Subscribe"
                    ) : (
                      isCurrent ? "Current plan" : "Already subscribed"
                    )}
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}
