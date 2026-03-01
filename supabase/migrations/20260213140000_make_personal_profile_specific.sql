-- Migration: Make personal and emergency_contacts profile-specific
-- Each profile is now completely isolated (like separate family members)

-- Step 1: Add profile_id to personal table (nullable first)
ALTER TABLE public.personal
  ADD COLUMN IF NOT EXISTS profile_id UUID;

-- Step 2: Add profile_id to user_emergency_contacts (nullable first)
ALTER TABLE public.user_emergency_contacts
  ADD COLUMN IF NOT EXISTS profile_id UUID;

-- Step 3: Migrate existing data to primary profiles
DO $$
DECLARE
  user_record RECORD;
  default_profile_id UUID;
BEGIN
  -- Migrate personal data
  FOR user_record IN 
    SELECT DISTINCT id as user_id FROM public.personal WHERE profile_id IS NULL
  LOOP
    SELECT id INTO default_profile_id
    FROM public.profiles
    WHERE user_id = user_record.user_id AND is_primary = TRUE
    LIMIT 1;
    
    IF default_profile_id IS NOT NULL THEN
      UPDATE public.personal
      SET profile_id = default_profile_id
      WHERE id = user_record.user_id AND profile_id IS NULL;
    END IF;
  END LOOP;

  -- Migrate emergency contacts
  FOR user_record IN 
    SELECT DISTINCT user_id FROM public.user_emergency_contacts WHERE profile_id IS NULL
  LOOP
    SELECT id INTO default_profile_id
    FROM public.profiles
    WHERE user_id = user_record.user_id AND is_primary = TRUE
    LIMIT 1;
    
    IF default_profile_id IS NOT NULL THEN
      UPDATE public.user_emergency_contacts
      SET profile_id = default_profile_id
      WHERE user_id = user_record.user_id AND profile_id IS NULL;
    END IF;
  END LOOP;
END $$;

-- Step 4: Make profile_id NOT NULL
ALTER TABLE public.personal
  ALTER COLUMN profile_id SET NOT NULL;

ALTER TABLE public.user_emergency_contacts
  ALTER COLUMN profile_id SET NOT NULL;

-- Step 5: Drop old primary keys
ALTER TABLE public.personal
  DROP CONSTRAINT IF EXISTS personal_pkey;

ALTER TABLE public.user_emergency_contacts
  DROP CONSTRAINT IF EXISTS user_emergency_contacts_pkey;

-- Step 6: Add foreign key constraints (with IF NOT EXISTS check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_personal_profile'
  ) THEN
    ALTER TABLE public.personal
      ADD CONSTRAINT fk_personal_profile
      FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_emergency_contacts_profile'
  ) THEN
    ALTER TABLE public.user_emergency_contacts
      ADD CONSTRAINT fk_user_emergency_contacts_profile
      FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Step 7: Add new primary keys (with proper check for existing PKs)
DO $$
BEGIN
  -- Check if personal table has ANY primary key
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c 
    JOIN pg_class t ON c.conrelid = t.oid 
    WHERE t.relname = 'personal' AND c.contype = 'p'
  ) THEN
    ALTER TABLE public.personal
      ADD CONSTRAINT personal_pkey PRIMARY KEY (profile_id);
  END IF;

  -- Check if user_emergency_contacts table has ANY primary key
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c 
    JOIN pg_class t ON c.conrelid = t.oid 
    WHERE t.relname = 'user_emergency_contacts' AND c.contype = 'p'
  ) THEN
    ALTER TABLE public.user_emergency_contacts
      ADD CONSTRAINT user_emergency_contacts_pkey PRIMARY KEY (profile_id);
  END IF;
END $$;

-- Step 8: Create indexes for user_id (still useful for queries)
CREATE INDEX IF NOT EXISTS idx_personal_user_id
  ON public.personal(id);

CREATE INDEX IF NOT EXISTS idx_user_emergency_contacts_user_id
  ON public.user_emergency_contacts(user_id);

-- Step 9: Add comments
COMMENT ON TABLE public.personal IS 'Personal information - 1 row per profile (each profile is isolated)';
COMMENT ON TABLE public.user_emergency_contacts IS 'Emergency contacts - profile-specific (each profile has own contacts)';
