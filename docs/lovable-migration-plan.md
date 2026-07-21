# Lovable migration plan

## Current Lovable coupling

The repository still has a few distinct Lovable dependencies:

- AI calls are routed through the Lovable gateway in [src/lib/ai-gateway.server.ts](src/lib/ai-gateway.server.ts) and the server functions in [src/lib/prep.functions.ts](src/lib/prep.functions.ts), [src/lib/tailor.functions.ts](src/lib/tailor.functions.ts), and [src/routes/api/chat.ts](src/routes/api/chat.ts).
- The app expects the legacy environment variable `LOVABLE_API_KEY` for AI access.
- Several runtime messages still mention Lovable Cloud when Supabase env vars are missing in [src/integrations/supabase/client.ts](src/integrations/supabase/client.ts), [src/integrations/supabase/client.server.ts](src/integrations/supabase/client.server.ts), and [src/integrations/supabase/auth-middleware.ts](src/integrations/supabase/auth-middleware.ts).
- There are also generated Lovable/MCP route artifacts and the `@lovable.dev/mcp-js` package, which can be retired later once the app no longer depends on those routes.

## Migration plan

1. Replace the Lovable gateway adapter with a Gemini provider that uses your own `GEMINI_API_KEY`.
2. Update the prep, tailoring, and chat endpoints to use the new Gemini provider.
3. Replace Lovable-specific environment guidance with Supabase + Gemini guidance.
4. Keep the app behavior intact while removing the old `LOVABLE_API_KEY` contract.
5. Optionally retire the MCP/Lovable route artifacts after the core app has been validated.

## Incremental implementation status

- Step 1: completed — the shared AI provider now uses Google Gemini directly.
- Step 2: completed — the prep, tailoring, and chat server routes now call Gemini directly.
- Step 3: in progress — Supabase guidance is being updated to point to your own project instead of Lovable Cloud.
- Step 4: pending — validate the app build and then review the remaining Lovable-specific route artifacts.
