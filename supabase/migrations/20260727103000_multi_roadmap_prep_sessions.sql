ALTER TABLE public.prep_sessions
  ADD COLUMN IF NOT EXISTS roadmap_id TEXT,
  ADD COLUMN IF NOT EXISTS roadmap_name TEXT,
  ADD COLUMN IF NOT EXISTS roadmap_color TEXT;

UPDATE public.prep_sessions
SET roadmap_id = COALESCE(roadmap_id, 'roadmap-1')
WHERE roadmap_id IS NULL;

ALTER TABLE public.prep_sessions
  ALTER COLUMN roadmap_id SET DEFAULT 'roadmap-1',
  ALTER COLUMN roadmap_id SET NOT NULL;

ALTER TABLE public.prep_sessions
  DROP CONSTRAINT IF EXISTS prep_sessions_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS prep_sessions_user_id_roadmap_id_key
  ON public.prep_sessions(user_id, roadmap_id);
