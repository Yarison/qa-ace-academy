import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

const links = [
  { to: "/practice", label: "Practice" },
  { to: "/sql-playground", label: "SQL Playground" },
  { to: "/mock", label: "Mock Interview" },
  { to: "/schedule", label: "Schedule" },
] as const;

export function Nav() {
  const [session, setSession] = useState<Session | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <nav className="mx-auto flex h-12 max-w-6xl items-center gap-8 px-6 text-[13px]">
        <Link to="/" className="font-semibold tracking-tight text-foreground">
          qa<span className="text-terminal">.</span>repl
        </Link>
        <div className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="rounded-full px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{
                className:
                  "rounded-full px-3 py-1.5 text-foreground bg-accent",
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
                to="/history"
                className="hidden rounded-full px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
                activeProps={{
                  className:
                    "hidden sm:inline-flex rounded-full px-3 py-1.5 text-foreground bg-accent",
                }}
              >
                History
              </Link>
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  navigate({ to: "/" });
                }}
                className="rounded-full px-3 py-1.5 text-muted-foreground hover:text-foreground"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              to="/auth"
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
