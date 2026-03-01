-- Migration: align medical-vault storage RLS with profile-based ownership
-- Problem fixed:
--   Uploads now use <profile_id>/<folder>/<file>, but legacy storage RLS commonly expects auth.uid()
--   as the first path segment. That causes:
--   "new row violates row-level security policy"
--
-- This migration enforces:
--   1) Only authenticated users can access objects in bucket medical-vault
--   2) First path segment must be a profile ID owned by auth.uid()
--   3) Folder segment must be one of reports/prescriptions/insurance/bills
--   4) Separate vault namespace per profile

BEGIN;

-- Ensure bucket exists and remains private.
INSERT INTO storage.buckets (id, name, public)
VALUES ('medical-vault', 'medical-vault', false)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public;

-- On newer Supabase projects, this statement can fail with:
--   "must be owner of table objects"
-- RLS is already managed/enabled by the platform for storage.objects,
-- so skip hard failure if ownership is restricted.
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY (insufficient privilege).';
  END;
END $$;

-- Drop any existing medical-vault policies on storage.objects so reruns stay deterministic.
DO $$
DECLARE
  policy_record RECORD;
BEGIN
  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND (
        COALESCE(qual, '') ILIKE '%medical-vault%'
        OR COALESCE(with_check, '') ILIKE '%medical-vault%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', policy_record.policyname);
  END LOOP;
END $$;

CREATE POLICY medical_vault_profile_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'medical-vault'
    AND split_part(name, '/', 1) <> ''
    AND split_part(name, '/', 2) = ANY (ARRAY['reports', 'prescriptions', 'insurance', 'bills'])
    AND split_part(name, '/', 1) IN (
      SELECT p.id::text
      FROM public.profiles p
      WHERE p.auth_id = auth.uid() OR p.user_id = auth.uid()
    )
  );

CREATE POLICY medical_vault_profile_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'medical-vault'
    AND split_part(name, '/', 1) <> ''
    AND split_part(name, '/', 2) = ANY (ARRAY['reports', 'prescriptions', 'insurance', 'bills'])
    AND split_part(name, '/', 3) <> ''
    AND split_part(name, '/', 1) IN (
      SELECT p.id::text
      FROM public.profiles p
      WHERE p.auth_id = auth.uid() OR p.user_id = auth.uid()
    )
  );

CREATE POLICY medical_vault_profile_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'medical-vault'
    AND split_part(name, '/', 1) <> ''
    AND split_part(name, '/', 2) = ANY (ARRAY['reports', 'prescriptions', 'insurance', 'bills'])
    AND split_part(name, '/', 1) IN (
      SELECT p.id::text
      FROM public.profiles p
      WHERE p.auth_id = auth.uid() OR p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'medical-vault'
    AND split_part(name, '/', 1) <> ''
    AND split_part(name, '/', 2) = ANY (ARRAY['reports', 'prescriptions', 'insurance', 'bills'])
    AND split_part(name, '/', 3) <> ''
    AND split_part(name, '/', 1) IN (
      SELECT p.id::text
      FROM public.profiles p
      WHERE p.auth_id = auth.uid() OR p.user_id = auth.uid()
    )
  );

CREATE POLICY medical_vault_profile_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'medical-vault'
    AND split_part(name, '/', 1) <> ''
    AND split_part(name, '/', 2) = ANY (ARRAY['reports', 'prescriptions', 'insurance', 'bills'])
    AND split_part(name, '/', 1) IN (
      SELECT p.id::text
      FROM public.profiles p
      WHERE p.auth_id = auth.uid() OR p.user_id = auth.uid()
    )
  );

COMMIT;
