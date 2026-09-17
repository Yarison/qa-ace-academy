import { getRequest, getRequestIP } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { TIER_LIMITS } from "@/lib/tiers";

export type AiUsageResult =
  | { type: "anonymous"; remaining: number; limit_value: number }
  | { type: "signed-in"; remaining: number; limit_value: number; tier: string };

// Keep this in sync with the Postgres v_limit CASE in the tiered AI usage migration.
// The database function is the source of truth for atomic enforcement; this JS map is
// shared via the client-safe tiers helper and used for display values.
export { TIER_LIMITS };

// ---------------------------------------------------------------------------
// Supabase client helpers
// ---------------------------------------------------------------------------

function getSupabaseConfig(): { url: string; publishableKey: string } {
  // Read with VITE_ fallbacks so the same code works locally (.env has
  // VITE_SUPABASE_URL) and in Lovable's platform (plain SUPABASE_URL is injected).
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const publishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    const missing = [
      ...(!url ? ["SUPABASE_URL (or VITE_SUPABASE_URL)"] : []),
      ...(!publishableKey ? ["SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY)"] : []),
    ];
    throw new Error(`Missing Supabase config: ${missing.join(", ")}`);
  }

  return { url, publishableKey };
}

// Lazy singleton — anon key client used for token validation and anonymous RPC calls.
let _anonClient: ReturnType<typeof createClient<Database>> | undefined;

function getAnonClient(): ReturnType<typeof createClient<Database>> {
  if (_anonClient) return _anonClient;
  const { url, publishableKey } = getSupabaseConfig();
  _anonClient = createClient<Database>(url, publishableKey, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return _anonClient;
}

/**
 * Create a one-shot authenticated Supabase client scoped to the given JWT.
 * The RPC functions on the server are granted to the `authenticated` role;
 * this client satisfies that role without requiring the service-role key.
 */
function createAuthedClient(token: string): ReturnType<typeof createClient<Database>> {
  const { url, publishableKey } = getSupabaseConfig();
  return createClient<Database>(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// ---------------------------------------------------------------------------
// IP resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the client IP address for anonymous rate-limiting.
 *
 * Priority:
 *  1. CF-Connecting-IP — CDN-injected, cannot be spoofed. Production only.
 *  2. True-Client-IP   — Akamai/Cloudflare Enterprise. Production only.
 *  3. getRequestIP()   — TanStack Start / srvx socket-level IP. Always present
 *                        locally (returns "::1"/"127.0.0.1") and in production.
 *                        Cannot be spoofed because it comes from the OS socket.
 *  4. X-Forwarded-For  — Production only fallback behind a trusted proxy.
 *
 * In development the result is prefixed with "dev::" so dev keys are clearly
 * distinct in the database. Rate limiting still applies — 3 calls and you hit
 * the wall just like a real anonymous user in production.
 */
function resolveAnonymousKey(request: Request): string {
  const headers = request.headers;
  const isDev = process.env.NODE_ENV !== "production";

  if (!isDev) {
    const cf = headers.get("cf-connecting-ip")?.trim();
    if (cf) return cf;

    const trueClient = headers.get("true-client-ip")?.trim();
    if (trueClient) return trueClient;
  }

  // Socket-level IP — always available, cannot be spoofed.
  const socketIp = getRequestIP();
  if (socketIp) {
    const normalized = socketIp === "::1" ? "127.0.0.1" : socketIp;
    return isDev ? `dev::${normalized}` : normalized;
  }

  if (!isDev) {
    const xff = headers
      .get("x-forwarded-for")
      ?.split(",")
      .map((v) => v.trim())
      .find(Boolean);
    if (xff) return xff;

    const xri = headers.get("x-real-ip")?.trim();
    if (xri) return xri;
  }

  // Final dev fallback — stable local key, never a real IP.
  return "dev::127.0.0.1";
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

function mapUsageError(error: unknown): Error {
  const message =
    (error as { message?: string })?.message ??
    (error instanceof Error ? error.message : String(error));

  if (message.includes("Anonymous AI limit reached")) {
    return new Error("You've used all 3 free AI tries. Sign in to continue using AI features.");
  }
  if (message.includes("Insufficient AI points")) {
    return new Error("You've used all 40 AI points for today. Your points reset tomorrow.");
  }
  console.error("[ai-usage] unexpected error:", error);
  return new Error("AI usage check failed. Please try again later.");
}

// ---------------------------------------------------------------------------
// Token extraction
// ---------------------------------------------------------------------------

/**
 * Validate the Bearer token from the Authorization header using the anon
 * Supabase client (same approach as auth-middleware.ts). Returns the validated
 * raw token string if the user is authenticated, or null for anonymous requests.
 */
async function getValidatedTokenFromRequest(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  const fallbackToken = request.headers.get("x-supabase-access-token")?.trim() ?? null;
  const token = bearerToken || fallbackToken;
  if (!token) return null;

  try {
  const { data, error } = await getAnonClient().auth.getUser(token);

  console.log("[ai-usage] auth debug:", {
    hasToken: Boolean(token),
    hasUser: Boolean(data?.user),
    userId: data?.user?.id ?? null,
    error: error?.message ?? null,
  });

  if (error || !data?.user?.id) return null;
  return token;
} catch (error) {
  console.error("[ai-usage] auth validation error:", {
    message: error instanceof Error ? error.message : String(error),
  });
  return null;
}

  // try {
  //   const { data, error } = await getAnonClient().auth.getClaims(token);
  //   if (error || !data?.claims?.sub) return null;
  //   return token;
  // } catch {
  //   return null;
  // }
}

// ---------------------------------------------------------------------------
// Consumption helpers
// ---------------------------------------------------------------------------

/**
 * Consume points for a signed-in user.
 *
 * Calls consume_ai_user_points() with an authenticated Supabase client so
 * auth.uid() inside the Postgres function resolves to the current user.
 * No p_user_id is passed — the function is hardened against targeting other
 * users by using auth.uid() internally.
 *
 * Race condition safety: the Postgres function uses a single atomic
 * INSERT … ON CONFLICT DO UPDATE … WHERE … RETURNING statement. Two
 * simultaneous calls cannot both succeed if the remaining budget is < cost.
 */
async function consumeSignedInUsage(token: string, cost: number): Promise<AiUsageResult> {
  const client = createAuthedClient(token);
  const { data, error } = await client.rpc("consume_ai_user_points", {
    p_cost: cost,
  });

  if (error) {
    throw mapUsageError(error);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.remaining !== "number" || typeof row.limit_value !== "number") {
    throw new Error("AI usage check failed. Please try again later.");
  }

  const tier = typeof row.tier === "string" && row.tier ? row.tier : "free";
  return { type: "signed-in", remaining: row.remaining, limit_value: row.limit_value, tier };
}

/**
 * Consume one anonymous AI call.
 *
 * Calls consume_anonymous_ai_call() with the anon-key Supabase client.
 * The function is SECURITY DEFINER so it can write to ai_usage_anonymous
 * despite RLS being enabled. The IP key comes from server-side code only —
 * the client has no influence over which IP is tracked.
 *
 * Race condition safety: same single-statement atomic INSERT … ON CONFLICT
 * strategy as the signed-in function.
 */
async function consumeAnonymousUsage(ipKey: string): Promise<AiUsageResult> {
  const { data, error } = await getAnonClient().rpc("consume_anonymous_ai_call", {
    p_ip_address: ipKey,
  });

  if (error) {
    throw mapUsageError(error);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.remaining !== "number" || typeof row.limit_value !== "number") {
    throw new Error("AI usage check failed. Please try again later.");
  }

  return { type: "anonymous", remaining: row.remaining, limit_value: row.limit_value };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check and atomically consume AI usage before a Gemini call.
 *
 * - If the request carries a valid Bearer token → signed-in path (points).
 * - Otherwise → anonymous path (IP-based call count).
 *
 * Throws a user-facing Error if the limit is exceeded or if an unexpected
 * database error occurs. Never exposes raw errors or IP addresses to callers.
 */
export async function checkAndConsumeAiUsage(cost: number): Promise<AiUsageResult> {
  const request = getRequest();
  if (!request?.headers) {
    throw new Error("AI usage check failed. Please try again later.");
  }

  const token = await getValidatedTokenFromRequest(request);
  if (token) {
    return consumeSignedInUsage(token, cost);
  }

  const ipKey = resolveAnonymousKey(request);
  return consumeAnonymousUsage(ipKey);
}

export function resolveTierLimit(tier: string): number {
  return TIER_LIMITS[tier] ?? TIER_LIMITS.free;
}
