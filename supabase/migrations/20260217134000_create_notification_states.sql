BEGIN;

CREATE TABLE IF NOT EXISTS public.notification_states (
  user_id uuid NOT NULL,
  notification_id text NOT NULL,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, notification_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_states_user_updated
  ON public.notification_states (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_states_user_dismissed
  ON public.notification_states (user_id, dismissed_at DESC);

ALTER TABLE public.notification_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own notification states" ON public.notification_states;
DROP POLICY IF EXISTS "Users can insert their own notification states" ON public.notification_states;
DROP POLICY IF EXISTS "Users can update their own notification states" ON public.notification_states;
DROP POLICY IF EXISTS "Users can delete their own notification states" ON public.notification_states;

CREATE POLICY "Users can view their own notification states"
  ON public.notification_states
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own notification states"
  ON public.notification_states
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own notification states"
  ON public.notification_states
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own notification states"
  ON public.notification_states
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

COMMIT;

