-- Migration: support profile-based phone lookup and family read access on profiles

BEGIN;

CREATE INDEX IF NOT EXISTS idx_profiles_phone
  ON public.profiles(phone);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles family members can view same family profiles" ON public.profiles;
CREATE POLICY "Profiles family members can view same family profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.family_members owner_member
      JOIN public.family_members viewer_member
        ON viewer_member.family_id = owner_member.family_id
      WHERE owner_member.user_id = profiles.user_id
        AND viewer_member.user_id = auth.uid()
    )
  );

COMMIT;
