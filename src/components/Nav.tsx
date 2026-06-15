import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { Terminal, LogOut } from "lucide-react";

const links = [
  { to: "/practice", label: "practice" },
  { to: "/sql-playground", label: "sql" },
  { to: "/mock", label: "mock" },
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
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <nav className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link to="/" className="flex items-center gap-2 font-mono font-bold text-terminal">
          <Terminal className="h-4 w-4" />
          qa.repl
        </Link>
        <div className="flex items-center gap-1 font-mono text-sm">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="rounded px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              activeProps={{ className: "rounded px-2.5 py-1.5 bg-accent text-terminal" }}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 font-mono text-sm">
          {session ? (
            <>
              <Link
                to="/history"
                className="rounded px-2.5 py-1.5 text-muted-foreground hover:text-foreground"
                activeProps={{ className: "rounded px-2.5 py-1.5 text-terminal" }}
              >
                history
              </Link>
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  navigate({ to: "/" });
                }}
                className="inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-muted-foreground hover:text-destructive"
              >
                <LogOut className="h-3.5 w-3.5" />
                logout
              </button>
            </>
          ) : (
            <Link
              to="/auth"
              className="rounded border border-terminal/40 bg-terminal/10 px-3 py-1.5 text-terminal hover:bg-terminal/20"
            >
              sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
