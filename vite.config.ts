// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

const cloudUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "https://gwuyrsyjqxsiwgxsitxi.supabase.co";
const cloudPublishableKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3dXlyc3lqcXhzaXdneHNpdHhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NDAyODgsImV4cCI6MjA5NzExNjI4OH0.CBDUxR0TPoSao9k1Cz8TL51vcMf4rhzq5b_0c5NWsFo";
const cloudProjectId = process.env.VITE_SUPABASE_PROJECT_ID ?? process.env.SUPABASE_PROJECT_ID ?? "gwuyrsyjqxsiwgxsitxi";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(cloudUrl),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(cloudPublishableKey),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(cloudProjectId),
    },
    plugins: [mcpPlugin()],
  },
});
