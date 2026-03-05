BEGIN;

-- Keep profile activity logs for 30 days only.
CREATE INDEX IF NOT EXISTS idx_profile_activity_logs_created_at
  ON public.profile_activity_logs (created_at);

CREATE OR REPLACE FUNCTION public.prune_profile_activity_logs_older_than_30_days()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.profile_activity_logs
  WHERE created_at < now() - interval '30 days';

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_prune_profile_activity_logs_older_than_30_days
  ON public.profile_activity_logs;

CREATE TRIGGER trg_prune_profile_activity_logs_older_than_30_days
AFTER INSERT ON public.profile_activity_logs
FOR EACH STATEMENT
EXECUTE FUNCTION public.prune_profile_activity_logs_older_than_30_days();

-- One-time cleanup for existing stale rows.
DELETE FROM public.profile_activity_logs
WHERE created_at < now() - interval '30 days';

COMMIT;
