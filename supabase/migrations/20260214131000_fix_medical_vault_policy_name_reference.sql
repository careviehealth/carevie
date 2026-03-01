-- Hotfix: fix storage policy expression to use storage.objects.name (outer row)
-- Previous policies could resolve split_part() against profiles.name inside the subquery,
-- causing all checks to fail and raising "new row violates row-level security policy".

BEGIN;

DROP POLICY IF EXISTS medical_vault_profile_select ON storage.objects;
DROP POLICY IF EXISTS medical_vault_profile_insert ON storage.objects;
DROP POLICY IF EXISTS medical_vault_profile_update ON storage.objects;
DROP POLICY IF EXISTS medical_vault_profile_delete ON storage.objects;

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
