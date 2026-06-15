import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Terminal } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — qa.repl" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Account created. You're signed in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back.");
      }
      navigate({ to: "/" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally { setLoading(false); }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md items-center px-4">
      <div className="surface w-full rounded-lg border border-border p-6">
        <div className="flex items-center gap-2 font-mono text-terminal">
          <Terminal className="h-4 w-4" /> {mode === "signin" ? "auth login" : "auth register"}
        </div>
        <form onSubmit={submit} className="mt-6 space-y-4 font-mono text-sm">
          <label className="block">
            <span className="text-xs text-muted-foreground">email</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-background px-3 py-2 outline-none focus:border-terminal/60" />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">password</span>
            <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-background px-3 py-2 outline-none focus:border-terminal/60" />
          </label>
          <button type="submit" disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded bg-terminal py-2 text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "signin" ? "$ login" : "$ register"}
          </button>
        </form>
        <button onClick={() => setMode((m) => (m === "signin" ? "signup" : "signin"))}
          className="mt-4 w-full text-center font-mono text-xs text-muted-foreground hover:text-terminal">
          {mode === "signin" ? "→ create account" : "→ have an account? sign in"}
        </button>
      </div>
    </main>
  );
}
