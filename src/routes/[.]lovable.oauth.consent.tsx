import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Terminal } from "lucide-react";

// Minimal typed wrapper for the beta supabase.auth.oauth namespace.
type OAuthDetails = {
  client?: { name?: string; redirect_uri?: string } | null;
  scope?: string;
  redirect_url?: string;
  redirect_to?: string;
};
type OAuthResult = { data: { redirect_url?: string; redirect_to?: string } | null; error: { message: string } | null };
const authOauth = () =>
  (supabase.auth as unknown as {
    oauth: {
      getAuthorizationDetails(id: string): Promise<{ data: OAuthDetails | null; error: { message: string } | null }>;
      approveAuthorization(id: string): Promise<OAuthResult>;
      denyAuthorization(id: string): Promise<OAuthResult>;
    };
  }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/auth", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await authOauth().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-md p-8 font-mono text-sm">
      <p className="text-destructive">Could not load this authorization request:</p>
      <p className="mt-2 text-muted-foreground">{String((error as Error)?.message ?? error)}</p>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(approve ? "approve" : "deny");
    setError(null);
    const { data, error } = approve
      ? await authOauth().approveAuthorization(authorization_id)
      : await authOauth().denyAuthorization(authorization_id);
    if (error) {
      setBusy(null);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(null);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "an app";

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md items-center px-4">
      <div className="surface w-full rounded-lg border border-border p-6 font-mono">
        <div className="flex items-center gap-2 text-terminal">
          <Terminal className="h-4 w-4" /> authorize connection
        </div>
        <h1 className="mt-4 text-lg font-semibold">
          Connect {clientName} to your account
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This lets {clientName} use AI Interview Coach as you. It can read your prep
          session, study plan, and saved mock-interview transcripts through the app's tools.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          This does not bypass the app's permissions — your account's data stays scoped to you.
        </p>
        {details?.client?.redirect_uri && (
          <p className="mt-3 break-all text-[11px] text-muted-foreground">
            Redirects to: {details.client.redirect_uri}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="mt-6 flex gap-2">
          <button
            disabled={busy !== null}
            onClick={() => decide(true)}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded bg-terminal py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy === "approve" && <Loader2 className="h-4 w-4 animate-spin" />}
            approve
          </button>
          <button
            disabled={busy !== null}
            onClick={() => decide(false)}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded border border-border py-2 text-sm hover:border-terminal/40 disabled:opacity-50"
          >
            {busy === "deny" && <Loader2 className="h-4 w-4 animate-spin" />}
            deny
          </button>
        </div>
      </div>
    </main>
  );
}
