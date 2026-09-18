import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createPortalSession } from "@/lib/billing.functions";
import type { Session } from "@supabase/supabase-js";

const links = [
  { to: "/prep", label: "My Calendar" },
  { to: "/prep/today", label: "Today's Prep" },
  { to: "/jobs", label: "Jobs" },
  { to: "/practice", label: "Practice" },
  { to: "/mock", label: "Mock Interview" },
] as const;

export function Nav() {
  const [session, setSession] = useState<Session | null>(null);
  const [hasStripeSubscription, setHasStripeSubscription] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const syncSession = async () => {
      const { data } = await supabase.auth.getSession();
      const nextSession = data.session;
      setSession(nextSession);

      if (!nextSession) {
        setHasStripeSubscription(false);
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("stripe_subscription_id")
        .eq("id", nextSession.user.id)
        .maybeSingle();

      if (!error) {
        setHasStripeSubscription(Boolean(profile?.stripe_subscription_id));
      }
    };

    syncSession();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) {
        setHasStripeSubscription(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <nav className="mx-auto flex h-12 max-w-6xl items-center gap-8 px-6 text-[13px]">
        <Link to="/" search={{}} className="font-semibold tracking-tight text-foreground">
          PrepPilotX
        </Link>
        <div className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              search={{}}
              className="rounded-full px-3 py-1.5 border border-transparent text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{
                className:
                  "rounded-full px-3 py-1.5 text-blue-900 bg-blue-100 border border-blue-500 dark:text-blue-100 dark:bg-blue-900 dark:border-blue-400",
              }}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {session ? (
            <>
              <Link
                to="/pricing"
                search={{}}
                className="rounded-full px-3 py-1.5 border border-transparent text-muted-foreground transition-colors hover:text-foreground"
              >
                Pricing
              </Link>
              <Link
                to="/history"
                search={{ next: "" }}
                className="rounded-full px-3 py-1.5 border border-transparent text-muted-foreground transition-colors hover:text-foreground"
                activeProps={{
                  className:
                    "hidden sm:inline-flex rounded-full px-3 py-1.5 text-blue-800 bg-blue-200 border border-blue-600 dark:text-blue-200 dark:bg-blue-950 dark:border-blue-500",
                }}
              >
                History
              </Link>
              {hasStripeSubscription && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const result = await createPortalSession({ data: {} });
                      if (result?.url) window.location.assign(result.url);
                    } catch (error) {
                      console.error("Unable to open Stripe portal:", error);
                    }
                  }}
                  className="rounded-full px-3 py-1.5 border border-border text-muted-foreground transition-colors hover:text-foreground"
                >
                  Manage billing
                </button>
              )}
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  navigate({ to: "/", search: {} });
                }}
                className="rounded-full px-3 py-1.5 text-muted-foreground hover:text-foreground"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              to="/auth"
              search={{ next: "" }}
              className="rounded-full bg-foreground px-3.5 py-1.5 text-background transition-opacity hover:opacity-90"
            >
              Sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
