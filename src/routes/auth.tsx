import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Terminal } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — qa.repl" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" ? s.next : "",
  }),
  component: AuthPage,
});

// Only allow same-origin relative paths to prevent open-redirect abuse.
function safeNext(next: string): string {
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const target = safeNext(next);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.href = target;
    });
  }, [target]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin + target },
        });
        if (error) throw error;
        toast.success("Account created. You're signed in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back.");
      }
      // Use full-page nav so external consent URLs (e.g. /.lovable/oauth/consent) work.
      if (target !== "/") window.location.href = target;
      else navigate({ to: "/" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally { setLoading(false); }
  }

  return (
    <main className="page-shell px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md items-center justify-center">
        <div className="page-card w-full p-6 sm:p-8">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
            <Terminal className="h-4 w-4 text-[var(--text-secondary)]" /> {mode === "signin" ? "auth login" : "auth register"}
          </div>
          <form onSubmit={submit} className="mt-6 space-y-4 text-sm">
            <label className="block">
              <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-secondary)]">email</span>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="mt-2 w-full rounded-lg border border-[var(--card-border)] bg-[var(--bg-base)] px-3 py-2.5 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)]" />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-secondary)]">password</span>
              <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
                className="mt-2 w-full rounded-lg border border-[var(--card-border)] bg-[var(--bg-base)] px-3 py-2.5 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)]" />
            </label>
            <button type="submit" disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-foreground py-2.5 text-sm font-medium text-background transition hover:opacity-90 disabled:opacity-50">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "signin" ? "Log in" : "Create account"}
            </button>
          </form>
          <button onClick={() => setMode((m) => (m === "signin" ? "signup" : "signin"))}
            className="mt-4 w-full text-center text-xs font-medium text-[var(--text-secondary)] transition hover:text-[var(--accent)]">
            {mode === "signin" ? "→ create account" : "→ have an account? sign in"}
          </button>
        </div>
      </div>
    </main>
  );
}
