BEGIN;

CREATE TABLE IF NOT EXISTS public.profile_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source = ANY (ARRAY['care_circle'])),
  domain text NOT NULL CHECK (domain = ANY (ARRAY['vault', 'medication', 'appointment'])),
  action text NOT NULL CHECK (action = ANY (ARRAY['upload', 'rename', 'delete', 'add', 'update'])),
  actor_user_id uuid NOT NULL,
  actor_display_name text,
  entity_id text,
  entity_label text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_activity_logs_profile_created_id
  ON public.profile_activity_logs (profile_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_profile_activity_logs_actor_created
  ON public.profile_activity_logs (actor_user_id, created_at DESC);

ALTER TABLE public.profile_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profile owners can view profile activity logs" ON public.profile_activity_logs;

CREATE POLICY "Profile owners can view profile activity logs"
  ON public.profile_activity_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = profile_activity_logs.profile_id
        AND (p.auth_id = auth.uid() OR p.user_id = auth.uid())
    )
  );

COMMIT;
