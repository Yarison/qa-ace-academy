CREATE TABLE public.prep_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_text TEXT,
  resume_analysis JSONB,
  job_description TEXT,
  jd_analysis JSONB,
  interview_date DATE,
  plan JSONB,
  completed JSONB NOT NULL DEFAULT '[]'::jsonb,
  rotation JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prep_sessions TO authenticated;
GRANT ALL ON public.prep_sessions TO service_role;

ALTER TABLE public.prep_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own prep session" ON public.prep_sessions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_prep_sessions_updated_at
  BEFORE UPDATE ON public.prep_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();