-- Canonical notification platform.
--
-- Five tables form the foundation:
--   user_notification_preferences  per-user channel + category + quiet hours + tz
--   notification_endpoints         web push (and future fcm/apns) subscriptions
--   user_notifications             canonical notification rows (single source of truth)
--   notification_deliveries        per-channel delivery audit trail
--   notification_jobs              durable scheduling queue (pg-row based, no external broker)
--
-- All inserts of canonical notifications and jobs happen via the service-role
-- admin client server-side. Authenticated users may only SELECT their own rows.

BEGIN;

-- ---------------------------------------------------------------------------
-- user_notification_preferences
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'UTC',
  channel_web_push boolean NOT NULL DEFAULT true,
  channel_in_app boolean NOT NULL DEFAULT true,
  category_prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  quiet_hours_start time,
  quiet_hours_end time,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notification preferences" ON public.user_notification_preferences;
CREATE POLICY "Users read own notification preferences"
  ON public.user_notification_preferences
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Writes go through the service-role admin client (server only).

-- ---------------------------------------------------------------------------
-- notification_endpoints
--   `endpoint_hash` is the sha256 of the push subscription endpoint URL so
--   re-registration of the same browser is idempotent and we never persist the
--   raw URL twice.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('web_push', 'fcm', 'apns')),
  endpoint_hash text NOT NULL,
  subscription jsonb NOT NULL,
  user_agent text,
  platform text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz,
  invalidated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_endpoints_unique UNIQUE (user_id, channel, endpoint_hash)
);

CREATE INDEX IF NOT EXISTS idx_notification_endpoints_user_active
  ON public.notification_endpoints (user_id)
  WHERE invalidated_at IS NULL AND disabled_at IS NULL;

ALTER TABLE public.notification_endpoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notification endpoints" ON public.notification_endpoints;
CREATE POLICY "Users read own notification endpoints"
  ON public.notification_endpoints
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- user_notifications
--   Canonical notification record. `dedupe_key` is unique per recipient so
--   re-emitting the same logical notification is a no-op (ON CONFLICT DO NOTHING).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id uuid,
  category text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_type text,
  source_id text,
  dedupe_key text NOT NULL,
  priority smallint NOT NULL DEFAULT 5,
  deep_link text,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  read_at timestamptz,
  dismissed_at timestamptz,
  acknowledged_at timestamptz,
  snoozed_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_notifications_dedupe_unique UNIQUE (user_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_active
  ON public.user_notifications (user_id, scheduled_for DESC)
  WHERE dismissed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_scheduled
  ON public.user_notifications (user_id, scheduled_for DESC);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_category
  ON public.user_notifications (user_id, category, scheduled_for DESC);

CREATE INDEX IF NOT EXISTS idx_user_notifications_source
  ON public.user_notifications (source_type, source_id);

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notifications" ON public.user_notifications;
CREATE POLICY "Users read own notifications"
  ON public.user_notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Updates of state (read/dismissed/acknowledged/snoozed) go through the
-- /api/notifications/[id]/state route using the service-role admin client.
-- We intentionally do not grant UPDATE to authenticated; this prevents clients
-- from modifying foreign fields (title/body/category/etc.).

-- ---------------------------------------------------------------------------
-- notification_deliveries
--   One row per (notification, endpoint) attempt. `status` tracks the outcome.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.user_notifications(id) ON DELETE CASCADE,
  endpoint_id uuid REFERENCES public.notification_endpoints(id) ON DELETE SET NULL,
  channel text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'skipped', 'invalidated')),
  attempt smallint NOT NULL DEFAULT 0,
  attempted_at timestamptz,
  delivered_at timestamptz,
  status_code int,
  error text,
  provider_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_notification
  ON public.notification_deliveries (notification_id);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_endpoint_status
  ON public.notification_deliveries (endpoint_id, status);

ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notification deliveries" ON public.notification_deliveries;
CREATE POLICY "Users read own notification deliveries"
  ON public.notification_deliveries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_notifications n
      WHERE n.id = notification_deliveries.notification_id
        AND n.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- notification_jobs
--   Durable queue. `dedupe_key` makes enqueue idempotent. `state` transitions
--   are pending -> in_progress -> completed|failed. Cancelled jobs from a
--   reconciliation pass stay around for audit but are skipped by the worker.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL CHECK (job_type IN ('materialize_reminder', 'deliver_push', 'reconcile')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  run_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
  attempts smallint NOT NULL DEFAULT 0,
  max_attempts smallint NOT NULL DEFAULT 5,
  locked_until timestamptz,
  worker_id text,
  dedupe_key text NOT NULL,
  source_type text,
  source_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_jobs_dedupe_unique UNIQUE (job_type, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_notification_jobs_pending_runat
  ON public.notification_jobs (run_at)
  WHERE state = 'pending';

CREATE INDEX IF NOT EXISTS idx_notification_jobs_inprogress_locked
  ON public.notification_jobs (locked_until)
  WHERE state = 'in_progress';

CREATE INDEX IF NOT EXISTS idx_notification_jobs_source_state
  ON public.notification_jobs (source_type, source_id, state);

ALTER TABLE public.notification_jobs ENABLE ROW LEVEL SECURITY;
-- No SELECT/INSERT/UPDATE policies for authenticated => service-role only.

-- ---------------------------------------------------------------------------
-- updated_at maintenance trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_user_notification_preferences_updated_at') THEN
    CREATE TRIGGER trg_user_notification_preferences_updated_at
      BEFORE UPDATE ON public.user_notification_preferences
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notification_endpoints_updated_at') THEN
    CREATE TRIGGER trg_notification_endpoints_updated_at
      BEFORE UPDATE ON public.notification_endpoints
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_user_notifications_updated_at') THEN
    CREATE TRIGGER trg_user_notifications_updated_at
      BEFORE UPDATE ON public.user_notifications
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notification_deliveries_updated_at') THEN
    CREATE TRIGGER trg_notification_deliveries_updated_at
      BEFORE UPDATE ON public.notification_deliveries
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notification_jobs_updated_at') THEN
    CREATE TRIGGER trg_notification_jobs_updated_at
      BEFORE UPDATE ON public.notification_jobs
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- claim_notification_jobs
--   Atomic batch claim. Reclaims stuck in_progress rows whose lock has expired.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_notification_jobs(
  p_worker_id text,
  p_limit int,
  p_lock_seconds int DEFAULT 300
)
RETURNS SETOF public.notification_jobs
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT id
    FROM public.notification_jobs
    WHERE (
      (state = 'pending' AND run_at <= now())
      OR (state = 'in_progress' AND locked_until IS NOT NULL AND locked_until < now())
    )
    ORDER BY run_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.notification_jobs j
  SET state = 'in_progress',
      attempts = j.attempts + 1,
      worker_id = p_worker_id,
      locked_until = now() + (p_lock_seconds || ' seconds')::interval,
      updated_at = now()
  FROM due
  WHERE j.id = due.id
  RETURNING j.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_notification_jobs(text, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_notification_jobs(text, int, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_jobs(text, int, int) TO service_role;

COMMIT;
