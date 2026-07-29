import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Terminal } from "lucide-react";

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

type FieldErrors = {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function userFriendlyAuthError(err: unknown): string {
  const message = (err as { message?: string })?.message?.toLowerCase() ?? "";

  if (message.includes("invalid login credentials")) {
    return "Incorrect email or password. Please try again.";
  }
  if (message.includes("email not confirmed")) {
    return "Please verify your email before signing in.";
  }
  if (message.includes("user already registered")) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (message.includes("password should be at least")) {
    return "Password must be at least 6 characters long.";
  }
  if (message.includes("unable to validate email address")) {
    return "Please enter a valid email address.";
  }
  if (message.includes("rate limit") || message.includes("too many requests")) {
    return "Too many attempts right now. Please wait a moment and try again.";
  }

  return (err as { message?: string })?.message || "Something went wrong. Please try again.";
}

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const target = safeNext(next);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.href = target;
    });
  }, [target]);

  function validate(): FieldErrors {
    const nextErrors: FieldErrors = {};
    const cleanEmail = email.trim();

    if (mode === "signup") {
      if (!firstName.trim()) nextErrors.firstName = "First name is required.";
      if (!lastName.trim()) nextErrors.lastName = "Last name is required.";
    }

    if (!cleanEmail) nextErrors.email = "Email is required.";
    else if (!isValidEmail(cleanEmail)) nextErrors.email = "Please enter a valid email address.";

    if (!password) nextErrors.password = "Password is required.";
    else if (password.length < 6) nextErrors.password = "Password must be at least 6 characters.";

    if (mode === "signup") {
      if (!confirmPassword) nextErrors.confirmPassword = "Please confirm your password.";
      else if (confirmPassword !== password) nextErrors.confirmPassword = "Passwords do not match.";
    }

    return nextErrors;
  }

  function clearFieldError(field: keyof FieldErrors) {
    if (!errors[field]) return;
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    setAuthError("");
    setLoading(true);
    try {
      if (mode === "signup") {
        const cleanFirst = firstName.trim();
        const cleanLast = lastName.trim();
        const displayName = `${cleanFirst} ${cleanLast}`.trim();

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin + target,
            data: {
              first_name: cleanFirst,
              last_name: cleanLast,
              full_name: displayName,
            },
          },
        });
        if (error) throw error;

        if (data.user?.id) {
          const { error: profileError } = await supabase
            .from("profiles")
            .upsert({
              id: data.user.id,
              display_name: displayName,
            }, { onConflict: "id" });
          if (profileError) throw profileError;
        }

        if (data.session) {
          toast.success("Account created. You're signed in.");
        } else {
          toast.success("Account created. Check your email to verify your account.");
          setMode("signin");
          setPassword("");
          setConfirmPassword("");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        toast.success("Welcome back.");
      }
      // Use full-page nav so external consent URLs (e.g. /.lovable/oauth/consent) work.
      if (target !== "/") window.location.href = target;
      else navigate({ to: "/" });
    } catch (err) {
      const message = userFriendlyAuthError(err);
      setAuthError(message);
      toast.error(message);
    } finally { setLoading(false); }
  }

  async function sendPasswordReset() {
    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setErrors((prev) => ({ ...prev, email: "Enter your email to reset your password." }));
      return;
    }

    if (!isValidEmail(cleanEmail)) {
      setErrors((prev) => ({ ...prev, email: "Please enter a valid email address." }));
      return;
    }

    setSendingReset(true);
    setAuthError("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${window.location.origin}/auth`,
      });
      if (error) throw error;
      toast.success("If an account exists for this email, a reset link has been sent.");
    } catch (err) {
      const message = userFriendlyAuthError(err);
      setAuthError(message);
      toast.error(message);
    } finally {
      setSendingReset(false);
    }
  }

  return (
    <main className="page-shell px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md items-center justify-center">
        <div className="page-card w-full p-6 sm:p-8">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
            <Terminal className="h-4 w-4 text-[var(--text-secondary)]" /> {mode === "signin" ? "auth login" : "auth register"}
          </div>
          <form onSubmit={submit} className="mt-6 space-y-4 text-sm" noValidate>
            {authError && (
              <div className="rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-3 py-2 text-xs text-[#92400E]">
                {authError}
              </div>
            )}

            {mode === "signup" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-secondary)]">first name</span>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => {
                      setFirstName(e.target.value);
                      clearFieldError("firstName");
                      if (authError) setAuthError("");
                    }}
                    aria-invalid={!!errors.firstName}
                    className="mt-2 w-full rounded-lg border border-[var(--card-border)] bg-[var(--bg-base)] px-3 py-2.5 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)]"
                  />
                  {errors.firstName && (
                    <p className="mt-1 text-xs text-[#B45309]">{errors.firstName}</p>
                  )}
                </label>

                <label className="block">
                  <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-secondary)]">last name</span>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => {
                      setLastName(e.target.value);
                      clearFieldError("lastName");
                      if (authError) setAuthError("");
                    }}
                    aria-invalid={!!errors.lastName}
                    className="mt-2 w-full rounded-lg border border-[var(--card-border)] bg-[var(--bg-base)] px-3 py-2.5 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)]"
                  />
                  {errors.lastName && (
                    <p className="mt-1 text-xs text-[#B45309]">{errors.lastName}</p>
                  )}
                </label>
              </div>
            )}

            <label className="block">
              <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-secondary)]">email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  clearFieldError("email");
                  if (authError) setAuthError("");
                }}
                aria-invalid={!!errors.email}
                className="mt-2 w-full rounded-lg border border-[var(--card-border)] bg-[var(--bg-base)] px-3 py-2.5 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)]"
              />
              {errors.email && <p className="mt-1 text-xs text-[#B45309]">{errors.email}</p>}
            </label>

            <label className="block">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-secondary)]">password</span>
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={sendPasswordReset}
                    disabled={sendingReset}
                    className="text-xs font-medium text-[var(--text-secondary)] transition hover:text-[var(--accent)] disabled:opacity-50"
                  >
                    {sendingReset ? "Sending..." : "Forgot password?"}
                  </button>
                )}
              </div>
              <div className="relative mt-2">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearFieldError("password");
                    if (authError) setAuthError("");
                  }}
                  aria-invalid={!!errors.password}
                  className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--bg-base)] px-3 py-2.5 pr-11 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-xs text-[#B45309]">{errors.password}</p>}
            </label>

            {mode === "signup" && (
              <label className="block">
                <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-secondary)]">confirm password</span>
                <div className="relative mt-2">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      clearFieldError("confirmPassword");
                      if (authError) setAuthError("");
                    }}
                    aria-invalid={!!errors.confirmPassword}
                    className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--bg-base)] px-3 py-2.5 pr-11 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute top-1/2 right-3 -translate-y-1/2 text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
                    aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p className="mt-1 text-xs text-[#B45309]">{errors.confirmPassword}</p>
                )}
              </label>
            )}

            <button type="submit" disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-foreground py-2.5 text-sm font-medium text-background transition hover:opacity-90 disabled:opacity-50">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "signin" ? "Log in" : "Create account"}
            </button>
          </form>
          <button onClick={() => {
            setMode((m) => (m === "signin" ? "signup" : "signin"));
            setErrors({});
            setAuthError("");
          }}
            className="mt-4 w-full text-center text-xs font-medium text-[var(--text-secondary)] transition hover:text-[var(--accent)]">
            {mode === "signin" ? "→ create account" : "→ have an account? sign in"}
          </button>
        </div>
      </div>
    </main>
  );
}
