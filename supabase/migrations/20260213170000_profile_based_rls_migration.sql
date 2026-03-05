-- Migration: move ownership checks from user_id/auth.uid() to profile_id -> profiles(auth_id)
-- Safe to rerun: uses IF NOT EXISTS patterns and policy replacement.

BEGIN;

-- 0) Ensure profiles.auth_id exists and is wired to auth.users(id).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'auth_id'
  ) THEN
    ALTER TABLE public.profiles
      ADD COLUMN auth_id UUID;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'user_id'
  ) THEN
    UPDATE public.profiles
    SET auth_id = user_id
    WHERE auth_id IS NULL;
  END IF;
END $$;

DO $$
DECLARE
  null_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO null_count
  FROM public.profiles
  WHERE auth_id IS NULL;

  IF null_count > 0 THEN
    RAISE EXCEPTION 'profiles.auth_id contains % NULL values. Backfill before rerunning this migration.', null_count;
  END IF;
END $$;

ALTER TABLE public.profiles
  ALTER COLUMN auth_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND t.relname = 'profiles'
      AND c.conname = 'profiles_auth_id_fkey'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_auth_id_fkey
      FOREIGN KEY (auth_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_auth_id
  ON public.profiles(auth_id);

-- 1) Backfill profile_id where still NULL, then enforce NOT NULL + FK + index.
DO $$
BEGIN
  -- UUID owner columns
  UPDATE public.care_circle_links t
  SET profile_id = (
    SELECT pr.id
    FROM public.profiles pr
    WHERE pr.auth_id = t.requester_id OR pr.user_id = t.requester_id
    ORDER BY pr.is_primary DESC, pr.created_at ASC NULLS LAST, pr.id
    LIMIT 1
  )
  WHERE t.profile_id IS NULL;

  UPDATE public.care_emergency_cards t
  SET profile_id = (
    SELECT pr.id
    FROM public.profiles pr
    WHERE pr.auth_id = t.user_id OR pr.user_id = t.user_id
    ORDER BY pr.is_primary DESC, pr.created_at ASC NULLS LAST, pr.id
    LIMIT 1
  )
  WHERE t.profile_id IS NULL;

  UPDATE public.health t
  SET profile_id = (
    SELECT pr.id
    FROM public.profiles pr
    WHERE pr.auth_id = t.user_id OR pr.user_id = t.user_id
    ORDER BY pr.is_primary DESC, pr.created_at ASC NULLS LAST, pr.id
    LIMIT 1
  )
  WHERE t.profile_id IS NULL;

  UPDATE public.personal t
  SET profile_id = (
    SELECT pr.id
    FROM public.profiles pr
    WHERE pr.auth_id = t.id OR pr.user_id = t.id
    ORDER BY pr.is_primary DESC, pr.created_at ASC NULLS LAST, pr.id
    LIMIT 1
  )
  WHERE t.profile_id IS NULL;

  UPDATE public.user_appointments t
  SET profile_id = (
    SELECT pr.id
    FROM public.profiles pr
    WHERE pr.auth_id = t.user_id OR pr.user_id = t.user_id
    ORDER BY pr.is_primary DESC, pr.created_at ASC NULLS LAST, pr.id
    LIMIT 1
  )
  WHERE t.profile_id IS NULL;

  UPDATE public.user_emergency_contacts t
  SET profile_id = (
    SELECT pr.id
    FROM public.profiles pr
    WHERE pr.auth_id = t.user_id OR pr.user_id = t.user_id
    ORDER BY pr.is_primary DESC, pr.created_at ASC NULLS LAST, pr.id
    LIMIT 1
  )
  WHERE t.profile_id IS NULL;

  UPDATE public.user_medical_team t
  SET profile_id = (
    SELECT pr.id
    FROM public.profiles pr
    WHERE pr.auth_id = t.user_id OR pr.user_id = t.user_id
    ORDER BY pr.is_primary DESC, pr.created_at ASC NULLS LAST, pr.id
    LIMIT 1
  )
  WHERE t.profile_id IS NULL;

  UPDATE public.user_medication_logs t
  SET profile_id = (
    SELECT pr.id
    FROM public.profiles pr
    WHERE pr.auth_id = t.user_id OR pr.user_id = t.user_id
    ORDER BY pr.is_primary DESC, pr.created_at ASC NULLS LAST, pr.id
    LIMIT 1
  )
  WHERE t.profile_id IS NULL;

  UPDATE public.user_medications t
  SET profile_id = (
    SELECT pr.id
    FROM public.profiles pr
    WHERE pr.auth_id = t.user_id OR pr.user_id = t.user_id
    ORDER BY pr.is_primary DESC, pr.created_at ASC NULLS LAST, pr.id
    LIMIT 1
  )
  WHERE t.profile_id IS NULL;

  -- TEXT owner columns
  UPDATE public.medical_reports_processed t
  SET profile_id = (
    SELECT pr.id
    FROM public.profiles pr
    WHERE
      lower(pr.auth_id::text) = lower(btrim(t.user_id))
      OR lower(pr.user_id::text) = lower(btrim(t.user_id))
      OR (
        substring(
          btrim(t.user_id)
          FROM '([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})'
        ) IS NOT NULL
        AND (
          pr.auth_id = substring(
            btrim(t.user_id)
            FROM '([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})'
          )::uuid
          OR pr.user_id = substring(
            btrim(t.user_id)
            FROM '([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})'
          )::uuid
        )
      )
    ORDER BY pr.is_primary DESC, pr.created_at ASC NULLS LAST, pr.id
    LIMIT 1
  )
  WHERE t.profile_id IS NULL;

  UPDATE public.medical_summaries_cache t
  SET profile_id = (
    SELECT pr.id
    FROM public.profiles pr
    WHERE
      lower(pr.auth_id::text) = lower(btrim(t.user_id))
      OR lower(pr.user_id::text) = lower(btrim(t.user_id))
      OR (
        substring(
          btrim(t.user_id)
          FROM '([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})'
        ) IS NOT NULL
        AND (
          pr.auth_id = substring(
            btrim(t.user_id)
            FROM '([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})'
          )::uuid
          OR pr.user_id = substring(
            btrim(t.user_id)
            FROM '([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})'
          )::uuid
        )
      )
    ORDER BY pr.is_primary DESC, pr.created_at ASC NULLS LAST, pr.id
    LIMIT 1
  )
  WHERE t.profile_id IS NULL;
END $$;

-- Fail early with actionable IDs if any text-table rows are still unmapped.
DO $$
DECLARE
  unresolved_reports TEXT;
  unresolved_summaries TEXT;
BEGIN
  SELECT string_agg(format('id=%s user_id=%s', id, user_id), '; ')
  INTO unresolved_reports
  FROM (
    SELECT id, user_id
    FROM public.medical_reports_processed
    WHERE profile_id IS NULL
    ORDER BY created_at DESC NULLS LAST, id
    LIMIT 20
  ) r;

  IF unresolved_reports IS NOT NULL THEN
    RAISE EXCEPTION 'Unmapped rows remain in public.medical_reports_processed: %', unresolved_reports;
  END IF;

  SELECT string_agg(format('id=%s user_id=%s', id, user_id), '; ')
  INTO unresolved_summaries
  FROM (
    SELECT id, user_id
    FROM public.medical_summaries_cache
    WHERE profile_id IS NULL
    ORDER BY generated_at DESC NULLS LAST, id
    LIMIT 20
  ) s;

  IF unresolved_summaries IS NOT NULL THEN
    RAISE EXCEPTION 'Unmapped rows remain in public.medical_summaries_cache: %', unresolved_summaries;
  END IF;
END $$;

-- 2) Enforce profile_id NOT NULL + FK + index on all profile-owned tables.
DO $$
DECLARE
  t TEXT;
  has_nulls BIGINT;
  fk_exists BOOLEAN;
  target_tables TEXT[] := ARRAY[
    'care_circle_links',
    'care_emergency_cards',
    'health',
    'medical_reports_processed',
    'medical_summaries_cache',
    'personal',
    'user_appointments',
    'user_emergency_contacts',
    'user_medical_team',
    'user_medication_logs',
    'user_medications'
  ];
BEGIN
  FOREACH t IN ARRAY target_tables LOOP
    EXECUTE format('SELECT COUNT(*) FROM public.%I WHERE profile_id IS NULL', t) INTO has_nulls;
    IF has_nulls > 0 THEN
      RAISE EXCEPTION 'Table public.% has % rows with NULL profile_id. Backfill before rerunning.', t, has_nulls;
    END IF;

    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN profile_id SET NOT NULL',
      t
    );

    SELECT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class rel ON rel.oid = c.conrelid
      JOIN pg_namespace rel_ns ON rel_ns.oid = rel.relnamespace
      JOIN pg_class ref ON ref.oid = c.confrelid
      JOIN pg_namespace ref_ns ON ref_ns.oid = ref.relnamespace
      JOIN pg_attribute a ON a.attrelid = rel.oid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f'
        AND rel_ns.nspname = 'public'
        AND rel.relname = t
        AND ref_ns.nspname = 'public'
        AND ref.relname = 'profiles'
        AND array_length(c.conkey, 1) = 1
        AND a.attname = 'profile_id'
    ) INTO fk_exists;

    IF NOT fk_exists THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE',
        t,
        t || '_profile_id_fkey'
      );
    END IF;

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (profile_id)',
      'idx_' || t || '_profile_id',
      t
    );
  END LOOP;
END $$;

-- 2b) Remove legacy one-row-per-user uniqueness and enforce one-row-per-profile.
--     This fixes errors like:
--     duplicate key value violates unique constraint "health_user_id_unique"
DO $$
DECLARE
  rec RECORD;
BEGIN
  -- Drop legacy single-column user_id unique/primary constraints on target tables.
  FOR rec IN
    SELECT
      t.relname AS table_name,
      c.conname AS constraint_name
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = c.conkey[1]
    WHERE n.nspname = 'public'
      AND t.relname IN ('health', 'user_medications')
      AND c.contype IN ('u', 'p')
      AND array_length(c.conkey, 1) = 1
      AND a.attname = 'user_id'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',
      rec.table_name,
      rec.constraint_name
    );
  END LOOP;

  -- Drop standalone unique indexes on user_id (if any) not attached to constraints.
  FOR rec IN
    SELECT
      t.relname AS table_name,
      i.relname AS index_name
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_class t ON t.oid = x.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.indkey[0]
    LEFT JOIN pg_constraint c ON c.conindid = x.indexrelid
    WHERE n.nspname = 'public'
      AND t.relname IN ('health', 'user_medications')
      AND x.indisunique = TRUE
      AND x.indisprimary = FALSE
      AND x.indnatts = 1
      AND a.attname = 'user_id'
      AND c.oid IS NULL
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', rec.index_name);
  END LOOP;

  -- Ensure upsert conflict targets are valid and profile-scoped.
  CREATE UNIQUE INDEX IF NOT EXISTS health_profile_id_key
    ON public.health(profile_id);
  CREATE UNIQUE INDEX IF NOT EXISTS user_medications_profile_id_key
    ON public.user_medications(profile_id);

  -- Ensure user_medications has a PK after dropping legacy user_id PK/unique.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'user_medications'
      AND c.contype = 'p'
  ) THEN
    ALTER TABLE public.user_medications
      ADD CONSTRAINT user_medications_pkey PRIMARY KEY (profile_id);
  END IF;
END $$;

-- 3) Replace legacy RLS predicates that use user_id = auth.uid().
--    Owner access now resolves through profiles(auth_id) via profile_id.
DO $$
DECLARE
  p RECORD;
  t TEXT;
  owner_tables TEXT[] := ARRAY[
    'care_emergency_cards',
    'health',
    'medical_reports_processed',
    'medical_summaries_cache',
    'personal',
    'user_appointments',
    'user_emergency_contacts',
    'user_medical_team',
    'user_medication_logs',
    'user_medications'
  ];
BEGIN
  -- Drop only legacy user_id/auth.uid policies on target tables.
  FOR p IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY(owner_tables)
      AND (
        COALESCE(qual, '') ~* '(auth\\.uid\\(\\)\\s*=\\s*user_id|user_id\\s*=\\s*auth\\.uid\\(\\))'
        OR COALESCE(with_check, '') ~* '(auth\\.uid\\(\\)\\s*=\\s*user_id|user_id\\s*=\\s*auth\\.uid\\(\\))'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, p.tablename);
  END LOOP;

  -- Create deterministic owner policies.
  FOREACH t IN ARRAY owner_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'p_' || t || '_owner_via_profile', t);
    EXECUTE format($sql$
      CREATE POLICY %I
      ON public.%I
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE profiles.id = %I.profile_id
            AND profiles.auth_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE profiles.id = %I.profile_id
            AND profiles.auth_id = auth.uid()
        )
      )
    $sql$, 'p_' || t || '_owner_via_profile', t, t, t);
  END LOOP;
END $$;

-- 4) Care circle / family access:
--    allow SELECT when requester belongs to the same family_id as the profile owner.
DO $$
DECLARE
  t TEXT;
  family_read_tables TEXT[] := ARRAY[
    'care_emergency_cards',
    'health',
    'medical_reports_processed',
    'medical_summaries_cache',
    'personal',
    'user_appointments',
    'user_emergency_contacts',
    'user_medical_team',
    'user_medication_logs',
    'user_medications'
  ];
BEGIN
  FOREACH t IN ARRAY family_read_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'p_' || t || '_family_read_same_family', t);
    EXECUTE format($sql$
      CREATE POLICY %I
      ON public.%I
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.profiles target_profile
          JOIN public.family_members owner_member
            ON owner_member.user_id = target_profile.auth_id
          JOIN public.family_members viewer_member
            ON viewer_member.family_id = owner_member.family_id
          WHERE target_profile.id = %I.profile_id
            AND viewer_member.user_id = auth.uid()
        )
      )
    $sql$, 'p_' || t || '_family_read_same_family', t, t);
  END LOOP;
END $$;

-- Keep profiles table policies aligned with auth_id.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can create their own profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can delete their own profiles" ON public.profiles;

CREATE POLICY "Users can view their own profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = auth_id);

CREATE POLICY "Users can create their own profiles"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = auth_id);

CREATE POLICY "Users can update their own profiles"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = auth_id)
  WITH CHECK (auth.uid() = auth_id);

CREATE POLICY "Users can delete their own profiles"
  ON public.profiles
  FOR DELETE
  TO authenticated
  USING (auth.uid() = auth_id);

-- Keep user_profile_preferences policies profile-aware (through profiles/auth_id).
ALTER TABLE public.user_profile_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own preferences" ON public.user_profile_preferences;
DROP POLICY IF EXISTS "Users can insert their own preferences" ON public.user_profile_preferences;
DROP POLICY IF EXISTS "Users can update their own preferences" ON public.user_profile_preferences;

CREATE POLICY "Users can view their own preferences"
  ON public.user_profile_preferences
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.auth_id = auth.uid()
        AND (
          profiles.id = user_profile_preferences.last_selected_profile_id
          OR profiles.auth_id = user_profile_preferences.user_id
        )
    )
  );

CREATE POLICY "Users can insert their own preferences"
  ON public.user_profile_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.auth_id = auth.uid()
        AND (
          profiles.id = user_profile_preferences.last_selected_profile_id
          OR profiles.auth_id = user_profile_preferences.user_id
        )
    )
  );

CREATE POLICY "Users can update their own preferences"
  ON public.user_profile_preferences
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.auth_id = auth.uid()
        AND (
          profiles.id = user_profile_preferences.last_selected_profile_id
          OR profiles.auth_id = user_profile_preferences.user_id
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.auth_id = auth.uid()
        AND (
          profiles.id = user_profile_preferences.last_selected_profile_id
          OR profiles.auth_id = user_profile_preferences.user_id
        )
    )
  );

COMMIT;
