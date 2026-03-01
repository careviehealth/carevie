-- Migration: move profile-level personal attributes from public.personal to public.profiles
-- Rationale: personal.id is keyed by auth user, so it cannot support one row per profile.
-- This migration keeps personal for account-level compatibility, but makes profile edits use profiles.

BEGIN;

-- 1) Add profile-level columns.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS address TEXT;

-- 2) Backfill directly from personal rows already linked by profile_id.
UPDATE public.profiles p
SET
  display_name = COALESCE(NULLIF(btrim(p.display_name), ''), NULLIF(btrim(per.display_name), '')),
  phone = COALESCE(NULLIF(btrim(p.phone), ''), NULLIF(btrim(per.phone), '')),
  gender = COALESCE(NULLIF(btrim(p.gender), ''), NULLIF(btrim(per.gender), '')),
  address = COALESCE(NULLIF(btrim(p.address), ''), NULLIF(btrim(per.address), '')),
  updated_at = NOW()
FROM public.personal per
WHERE per.profile_id = p.id
  AND (
    ((p.display_name IS NULL OR btrim(p.display_name) = '') AND per.display_name IS NOT NULL)
    OR ((p.phone IS NULL OR btrim(p.phone) = '') AND per.phone IS NOT NULL)
    OR ((p.gender IS NULL OR btrim(p.gender) = '') AND per.gender IS NOT NULL)
    OR ((p.address IS NULL OR btrim(p.address) = '') AND per.address IS NOT NULL)
  );

-- 3) For profiles with no personal row by profile_id, fan out account-level personal row to all profiles.
--    This supports databases that still only have one personal row per auth user.
DO $$
DECLARE
  has_auth_id BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'auth_id'
  ) INTO has_auth_id;

  IF has_auth_id THEN
    UPDATE public.profiles p
    SET
      display_name = COALESCE(NULLIF(btrim(p.display_name), ''), NULLIF(btrim(per.display_name), '')),
      phone = COALESCE(NULLIF(btrim(p.phone), ''), NULLIF(btrim(per.phone), '')),
      gender = COALESCE(NULLIF(btrim(p.gender), ''), NULLIF(btrim(per.gender), '')),
      address = COALESCE(NULLIF(btrim(p.address), ''), NULLIF(btrim(per.address), '')),
      updated_at = NOW()
    FROM public.personal per
    WHERE per.id = p.auth_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.personal linked
        WHERE linked.profile_id = p.id
      )
      AND (
        ((p.display_name IS NULL OR btrim(p.display_name) = '') AND per.display_name IS NOT NULL)
        OR ((p.phone IS NULL OR btrim(p.phone) = '') AND per.phone IS NOT NULL)
        OR ((p.gender IS NULL OR btrim(p.gender) = '') AND per.gender IS NOT NULL)
        OR ((p.address IS NULL OR btrim(p.address) = '') AND per.address IS NOT NULL)
      );
  ELSE
    UPDATE public.profiles p
    SET
      display_name = COALESCE(NULLIF(btrim(p.display_name), ''), NULLIF(btrim(per.display_name), '')),
      phone = COALESCE(NULLIF(btrim(p.phone), ''), NULLIF(btrim(per.phone), '')),
      gender = COALESCE(NULLIF(btrim(p.gender), ''), NULLIF(btrim(per.gender), '')),
      address = COALESCE(NULLIF(btrim(p.address), ''), NULLIF(btrim(per.address), '')),
      updated_at = NOW()
    FROM public.personal per
    WHERE per.id = p.user_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.personal linked
        WHERE linked.profile_id = p.id
      )
      AND (
        ((p.display_name IS NULL OR btrim(p.display_name) = '') AND per.display_name IS NOT NULL)
        OR ((p.phone IS NULL OR btrim(p.phone) = '') AND per.phone IS NOT NULL)
        OR ((p.gender IS NULL OR btrim(p.gender) = '') AND per.gender IS NOT NULL)
        OR ((p.address IS NULL OR btrim(p.address) = '') AND per.address IS NOT NULL)
      );
  END IF;
END $$;

COMMIT;
