-- Stripe Checkout + webhook-driven plan management.
-- Keep public.profiles tier changes server-side only; clients can update their own
-- display_name and other profile fields, but not anything tied to billing.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

CREATE OR REPLACE FUNCTION public.set_user_tier(
  p_user_id uuid,
  p_tier text,
  p_stripe_customer_id text DEFAULT NULL,
  p_stripe_subscription_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_tier IS NULL THEN
    RAISE EXCEPTION 'Tier cannot be null';
  END IF;

  IF p_tier NOT IN ('free', 'tier1', 'tier2') THEN
    RAISE EXCEPTION 'Invalid tier value';
  END IF;

  UPDATE public.profiles
  SET
    tier = p_tier,
    stripe_customer_id = p_stripe_customer_id,
    stripe_subscription_id = p_stripe_subscription_id
  WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_user_tier TO service_role;

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (display_name) ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "Profiles update by owner" ON public.profiles;

CREATE POLICY "Profiles update by owner"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Keep the JS TIER_LIMITS map and the Postgres v_limit CASE in sync:
-- free=40, tier1=80, tier2=160.
