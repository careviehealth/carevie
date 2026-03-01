-- Migration: standardize care circle relationship values as access roles
-- Canonical roles: family, friend

BEGIN;

ALTER TABLE public.care_circle_links
  ADD COLUMN IF NOT EXISTS relationship TEXT;

ALTER TABLE public.care_circle_links
  DROP CONSTRAINT IF EXISTS care_circle_links_relationship_check;

UPDATE public.care_circle_links
SET relationship = CASE
  WHEN lower(
    regexp_replace(
      replace(replace(btrim(COALESCE(relationship, '')), '_', ' '), '-', ' '),
      '[[:space:]]+',
      ' ',
      'g'
    )
  ) = 'family' THEN 'family'
  ELSE 'friend'
END;

ALTER TABLE public.care_circle_links
  ALTER COLUMN relationship SET DEFAULT 'friend';

ALTER TABLE public.care_circle_links
  ALTER COLUMN relationship SET NOT NULL;

ALTER TABLE public.care_circle_links
  ADD CONSTRAINT care_circle_links_relationship_check
  CHECK (relationship = ANY (ARRAY['family', 'friend']));

CREATE INDEX IF NOT EXISTS idx_care_circle_links_requester_status_role
  ON public.care_circle_links (requester_id, status, relationship);

CREATE INDEX IF NOT EXISTS idx_care_circle_links_recipient_status_role
  ON public.care_circle_links (recipient_id, status, relationship);

COMMIT;
