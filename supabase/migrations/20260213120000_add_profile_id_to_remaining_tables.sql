-- Migration: Add profile_id to remaining tables for complete profile data isolation
-- This ensures each profile has its own care circle, appointments, medical team, etc.

-- Step 1: Add display_name to profiles table
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Set display_name to match name for existing profiles
UPDATE public.profiles SET display_name = name WHERE display_name IS NULL;

-- Step 2: Add profile_id columns (nullable first, constraints added later)
ALTER TABLE public.care_circle_links
  ADD COLUMN IF NOT EXISTS profile_id UUID;

ALTER TABLE public.care_emergency_cards
  ADD COLUMN IF NOT EXISTS profile_id UUID;

ALTER TABLE public.user_appointments
  ADD COLUMN IF NOT EXISTS profile_id UUID;

ALTER TABLE public.user_medical_team
  ADD COLUMN IF NOT EXISTS profile_id UUID;

ALTER TABLE public.user_medication_logs
  ADD COLUMN IF NOT EXISTS profile_id UUID;

-- Step 3: Migrate existing data to primary profiles
DO $$
DECLARE
  user_record RECORD;
  default_profile_id UUID;
BEGIN
  -- Migrate care_circle_links
  FOR user_record IN 
    SELECT DISTINCT requester_id as user_id FROM public.care_circle_links WHERE profile_id IS NULL
  LOOP
    SELECT id INTO default_profile_id
    FROM public.profiles
    WHERE user_id = user_record.user_id AND is_primary = TRUE
    LIMIT 1;
    
    IF default_profile_id IS NOT NULL THEN
      UPDATE public.care_circle_links
      SET profile_id = default_profile_id
      WHERE requester_id = user_record.user_id AND profile_id IS NULL;
    END IF;
  END LOOP;

  -- Migrate care_emergency_cards
  FOR user_record IN 
    SELECT DISTINCT user_id FROM public.care_emergency_cards WHERE profile_id IS NULL
  LOOP
    SELECT id INTO default_profile_id
    FROM public.profiles
    WHERE user_id = user_record.user_id AND is_primary = TRUE
    LIMIT 1;
    
    IF default_profile_id IS NOT NULL THEN
      UPDATE public.care_emergency_cards
      SET profile_id = default_profile_id
      WHERE user_id = user_record.user_id AND profile_id IS NULL;
    END IF;
  END LOOP;

  -- Migrate user_appointments
  FOR user_record IN 
    SELECT DISTINCT user_id FROM public.user_appointments WHERE profile_id IS NULL
  LOOP
    SELECT id INTO default_profile_id
    FROM public.profiles
    WHERE user_id = user_record.user_id AND is_primary = TRUE
    LIMIT 1;
    
    IF default_profile_id IS NOT NULL THEN
      UPDATE public.user_appointments
      SET profile_id = default_profile_id
      WHERE user_id = user_record.user_id AND profile_id IS NULL;
    END IF;
  END LOOP;

  -- Migrate user_medical_team
  FOR user_record IN 
    SELECT DISTINCT user_id FROM public.user_medical_team WHERE profile_id IS NULL
  LOOP
    SELECT id INTO default_profile_id
    FROM public.profiles
    WHERE user_id = user_record.user_id AND is_primary = TRUE
    LIMIT 1;
    
    IF default_profile_id IS NOT NULL THEN
      UPDATE public.user_medical_team
      SET profile_id = default_profile_id
      WHERE user_id = user_record.user_id AND profile_id IS NULL;
    END IF;
  END LOOP;

  -- Migrate user_medication_logs
  FOR user_record IN 
    SELECT DISTINCT user_id FROM public.user_medication_logs WHERE profile_id IS NULL
  LOOP
    SELECT id INTO default_profile_id
    FROM public.profiles
    WHERE user_id = user_record.user_id AND is_primary = TRUE
    LIMIT 1;
    
    IF default_profile_id IS NOT NULL THEN
      UPDATE public.user_medication_logs
      SET profile_id = default_profile_id
      WHERE user_id = user_record.user_id AND profile_id IS NULL;
    END IF;
  END LOOP;
END $$;

-- Step 4: Make profile_id NOT NULL after migration
ALTER TABLE public.care_circle_links 
  ALTER COLUMN profile_id SET NOT NULL;

ALTER TABLE public.care_emergency_cards 
  ALTER COLUMN profile_id SET NOT NULL;

ALTER TABLE public.user_appointments 
  ALTER COLUMN profile_id SET NOT NULL;

ALTER TABLE public.user_medical_team 
  ALTER COLUMN profile_id SET NOT NULL;

ALTER TABLE public.user_medication_logs 
  ALTER COLUMN profile_id SET NOT NULL;

-- Step 5: Drop old primary keys where needed
ALTER TABLE public.care_emergency_cards
  DROP CONSTRAINT IF EXISTS care_emergency_cards_pkey;

ALTER TABLE public.user_appointments
  DROP CONSTRAINT IF EXISTS user_appointments_pkey;

ALTER TABLE public.user_medical_team
  DROP CONSTRAINT IF EXISTS user_medical_team_pkey;

ALTER TABLE public.user_medication_logs
  DROP CONSTRAINT IF EXISTS user_medication_logs_pkey;

-- Step 6: Add foreign key constraints (with IF NOT EXISTS check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_care_circle_links_profile'
  ) THEN
    ALTER TABLE public.care_circle_links
      ADD CONSTRAINT fk_care_circle_links_profile
      FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_care_emergency_cards_profile'
  ) THEN
    ALTER TABLE public.care_emergency_cards
      ADD CONSTRAINT fk_care_emergency_cards_profile
      FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_appointments_profile'
  ) THEN
    ALTER TABLE public.user_appointments
      ADD CONSTRAINT fk_user_appointments_profile
      FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_medical_team_profile'
  ) THEN
    ALTER TABLE public.user_medical_team
      ADD CONSTRAINT fk_user_medical_team_profile
      FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_medication_logs_profile'
  ) THEN
    ALTER TABLE public.user_medication_logs
      ADD CONSTRAINT fk_user_medication_logs_profile
      FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Step 7: Add new primary keys (with proper check for existing PKs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c 
    JOIN pg_class t ON c.conrelid = t.oid 
    WHERE t.relname = 'care_emergency_cards' AND c.contype = 'p'
  ) THEN
    ALTER TABLE public.care_emergency_cards
      ADD CONSTRAINT care_emergency_cards_pkey PRIMARY KEY (profile_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c 
    JOIN pg_class t ON c.conrelid = t.oid 
    WHERE t.relname = 'user_appointments' AND c.contype = 'p'
  ) THEN
    ALTER TABLE public.user_appointments
      ADD CONSTRAINT user_appointments_pkey PRIMARY KEY (profile_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c 
    JOIN pg_class t ON c.conrelid = t.oid 
    WHERE t.relname = 'user_medical_team' AND c.contype = 'p'
  ) THEN
    ALTER TABLE public.user_medical_team
      ADD CONSTRAINT user_medical_team_pkey PRIMARY KEY (profile_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c 
    JOIN pg_class t ON c.conrelid = t.oid 
    WHERE t.relname = 'user_medication_logs' AND c.contype = 'p'
  ) THEN
    ALTER TABLE public.user_medication_logs
      ADD CONSTRAINT user_medication_logs_pkey PRIMARY KEY (profile_id);
  END IF;
END $$;

-- Step 8: Create indexes
CREATE INDEX IF NOT EXISTS idx_care_circle_links_profile_id 
  ON public.care_circle_links(profile_id);

CREATE INDEX IF NOT EXISTS idx_care_emergency_cards_user_id 
  ON public.care_emergency_cards(user_id);

CREATE INDEX IF NOT EXISTS idx_user_appointments_user_id 
  ON public.user_appointments(user_id);

CREATE INDEX IF NOT EXISTS idx_user_medical_team_user_id 
  ON public.user_medical_team(user_id);

CREATE INDEX IF NOT EXISTS idx_user_medication_logs_user_id 
  ON public.user_medication_logs(user_id);

-- Step 9: Add comments for documentation
COMMENT ON COLUMN public.profiles.display_name IS 'Profile display name - source of truth for each profile';
COMMENT ON COLUMN public.personal.display_name IS 'Deprecated - use profiles.display_name instead';
