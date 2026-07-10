import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Nav } from "../components/Nav";
import { supabase } from "../integrations/supabase/client";
import { Toaster } from "../components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center font-mono">
        <h1 className="text-6xl font-bold text-terminal">404</h1>
        <p className="mt-3 text-sm text-muted-foreground">command not found</p>
        <Link to="/" className="mt-6 inline-block rounded border border-terminal/40 bg-terminal/10 px-3 py-1.5 text-terminal hover:bg-terminal/20">cd ~</Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => { reportLovableError(error, { boundary: "tanstack_root_error_component" }); }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 font-mono">
      <div className="max-w-md text-center">
        <h1 className="text-lg text-destructive">runtime error</h1>
        <p className="mt-2 text-xs text-muted-foreground">{error.message}</p>
        <button onClick={() => { router.invalidate(); reset(); }} className="mt-6 rounded border border-terminal/40 bg-terminal/10 px-3 py-1.5 text-terminal hover:bg-terminal/20">retry</button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "qa.repl — Personalized QA interview prep" },
      { name: "description", content: "Upload your resume, paste the job description, get a personalized day-by-day study calendar until interview day." },
      { property: "og:title", content: "qa.repl — Personalized QA interview prep" },
      { property: "og:description", content: "Upload your resume, paste the job description, get a personalized day-by-day study calendar until interview day." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "qa.repl — Personalized QA interview prep" },
      { name: "twitter:description", content: "Upload your resume, paste the job description, get a personalized day-by-day study calendar until interview day." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/e7b62b11-adbc-4cef-8ffd-5928e50c1826/id-preview-c4fb75d5--40b01111-6ed3-4746-9f87-c5027847492e.lovable.app-1783716898916.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/e7b62b11-adbc-4cef-8ffd-5928e50c1826/id-preview-c4fb75d5--40b01111-6ed3-4746-9f87-c5027847492e.lovable.app-1783716898916.png" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((e) => {
      if (e === "SIGNED_IN" || e === "SIGNED_OUT" || e === "USER_UPDATED") {
        router.invalidate();
        if (e !== "SIGNED_OUT") queryClient.invalidateQueries();
      }
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen">
        <Nav />
        <Outlet />
      </div>
      <Toaster />
    </QueryClientProvider>
  );
}
