ALTER TABLE public.prep_sessions
  ADD COLUMN IF NOT EXISTS generated_resume JSONB;
