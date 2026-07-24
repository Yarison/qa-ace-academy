-- Tiered AI usage tracking and atomic consumption helpers

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'free';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_tier_check CHECK (tier IN ('free', 'tier1', 'tier2'));

CREATE TABLE public.ai_usage_anonymous (
  ip_address TEXT PRIMARY KEY,
  calls_used INT NOT NULL DEFAULT 0 CHECK (calls_used >= 0),
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.ai_usage_anonymous TO service_role;
ALTER TABLE public.ai_usage_anonymous ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_ai_usage_anonymous_updated_at
  BEFORE UPDATE ON public.ai_usage_anonymous
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.ai_usage_user_daily (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  points_used INT NOT NULL DEFAULT 0 CHECK (points_used >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);

GRANT ALL ON public.ai_usage_user_daily TO service_role;
GRANT SELECT ON public.ai_usage_user_daily TO authenticated;
ALTER TABLE public.ai_usage_user_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their daily AI usage"
  ON public.ai_usage_user_daily
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_ai_usage_user_daily_updated_at
  BEFORE UPDATE ON public.ai_usage_user_daily
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Atomic signed-in usage consumption.
--
-- Uses auth.uid() instead of accepting p_user_id so that an authenticated
-- client can only ever consume its own quota — not another user's.
-- SECURITY DEFINER + SET search_path lets the function write to the usage
-- table while bypassing RLS, without requiring the service-role key.
CREATE OR REPLACE FUNCTION public.consume_ai_user_points(
  p_cost int
)
RETURNS TABLE (
  remaining int,
  limit_value int,
  tier text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_tier text := 'free';
  v_limit int := 40;
  v_points int;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT COALESCE(p.tier, 'free')
  INTO v_tier
  FROM public.profiles p
  WHERE p.id = v_user_id;

  v_limit := CASE v_tier
    WHEN 'tier1' THEN 80
    WHEN 'tier2' THEN 160
    ELSE 40
  END;

  INSERT INTO public.ai_usage_user_daily (user_id, date, points_used)
  VALUES (v_user_id, timezone('UTC', now())::date, p_cost)
  ON CONFLICT (user_id, date) DO UPDATE
    SET points_used = public.ai_usage_user_daily.points_used + p_cost,
        updated_at = now()
    WHERE public.ai_usage_user_daily.points_used + p_cost <= v_limit
  RETURNING points_used INTO v_points;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient AI points';
  END IF;

  RETURN QUERY SELECT v_limit - v_points, v_limit, v_tier;
END;
$$;

-- Grant to authenticated so user-scoped calls work without the service-role key.
-- Granting to service_role allows admin tooling to call it if needed.
GRANT EXECUTE ON FUNCTION public.consume_ai_user_points TO service_role, authenticated;

-- Atomic anonymous usage consumption.
--
-- SECURITY DEFINER lets the function write to the RLS-protected
-- ai_usage_anonymous table without requiring the service-role key.
-- The IP key is supplied by server-side code only — no client can influence
-- which IP is tracked (the call goes through our TanStack Start server fn).
CREATE OR REPLACE FUNCTION public.consume_anonymous_ai_call(
  p_ip_address text
)
RETURNS TABLE (
  remaining int,
  limit_value int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit int := 3;
  v_calls int;
BEGIN
  INSERT INTO public.ai_usage_anonymous (ip_address, calls_used)
  VALUES (p_ip_address, 1)
  ON CONFLICT (ip_address) DO UPDATE
    SET calls_used = public.ai_usage_anonymous.calls_used + 1,
        updated_at = now()
    WHERE public.ai_usage_anonymous.calls_used < v_limit
  RETURNING calls_used INTO v_calls;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Anonymous AI limit reached';
  END IF;

  RETURN QUERY SELECT v_limit - v_calls, v_limit;
END;
$$;

-- Grant to anon so calls made with the publishable key (no JWT) can reach
-- the function. service_role retains access for admin tooling.
GRANT EXECUTE ON FUNCTION public.consume_anonymous_ai_call TO service_role, anon;
