-- Add profile_id to all medical data tables for profile-based data isolation
-- This enables separate medical data for each sub-profile (family member)

-- Add profile_id column to health table
ALTER TABLE public.health 
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Add profile_id column to medical_reports_processed table
ALTER TABLE public.medical_reports_processed 
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Add profile_id column to user_medications table
ALTER TABLE public.user_medications 
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Add profile_id column to medical_summaries_cache table
ALTER TABLE public.medical_summaries_cache 
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_health_profile_id ON public.health(profile_id);
CREATE INDEX IF NOT EXISTS idx_medical_reports_profile_id ON public.medical_reports_processed(profile_id);
CREATE INDEX IF NOT EXISTS idx_user_medications_profile_id ON public.user_medications(profile_id);
CREATE INDEX IF NOT EXISTS idx_medical_summaries_profile_id ON public.medical_summaries_cache(profile_id);

-- Migrate existing data to default primary profile
-- This ensures no data loss for existing users
DO $$
DECLARE
  user_record RECORD;
  default_profile_id UUID;
BEGIN
  -- First, migrate health table (user_id is UUID)
  FOR user_record IN 
    SELECT DISTINCT user_id FROM public.health WHERE profile_id IS NULL
  LOOP
    -- Find the default primary profile for this user
    SELECT id INTO default_profile_id
    FROM public.profiles
    WHERE user_id = user_record.user_id AND is_primary = TRUE
    LIMIT 1;
    
    -- If found, migrate health data to this profile
    IF default_profile_id IS NOT NULL THEN
      UPDATE public.health
      SET profile_id = default_profile_id
      WHERE user_id = user_record.user_id AND profile_id IS NULL;
    END IF;
  END LOOP;
  
  -- Migrate user_medications table (user_id is UUID)
  FOR user_record IN 
    SELECT DISTINCT user_id FROM public.user_medications WHERE profile_id IS NULL
  LOOP
    SELECT id INTO default_profile_id
    FROM public.profiles
    WHERE user_id = user_record.user_id AND is_primary = TRUE
    LIMIT 1;
    
    IF default_profile_id IS NOT NULL THEN
      UPDATE public.user_medications
      SET profile_id = default_profile_id
      WHERE user_id = user_record.user_id AND profile_id IS NULL;
    END IF;
  END LOOP;
  
  -- Migrate medical_reports_processed table (user_id is TEXT, need to cast)
  FOR user_record IN 
    SELECT DISTINCT user_id::uuid as user_id FROM public.medical_reports_processed WHERE profile_id IS NULL
  LOOP
    SELECT id INTO default_profile_id
    FROM public.profiles
    WHERE user_id = user_record.user_id AND is_primary = TRUE
    LIMIT 1;
    
    IF default_profile_id IS NOT NULL THEN
      UPDATE public.medical_reports_processed
      SET profile_id = default_profile_id
      WHERE user_id::uuid = user_record.user_id AND profile_id IS NULL;
    END IF;
  END LOOP;
  
  -- Migrate medical_summaries_cache table (user_id is TEXT, need to cast)
  FOR user_record IN 
    SELECT DISTINCT user_id::uuid as user_id FROM public.medical_summaries_cache WHERE profile_id IS NULL
  LOOP
    SELECT id INTO default_profile_id
    FROM public.profiles
    WHERE user_id = user_record.user_id AND is_primary = TRUE
    LIMIT 1;
    
    IF default_profile_id IS NOT NULL THEN
      UPDATE public.medical_summaries_cache
      SET profile_id = default_profile_id
      WHERE user_id::uuid = user_record.user_id AND profile_id IS NULL;
    END IF;
  END LOOP;
END $$;

-- Update unique constraints to include profile_id
-- For health table (user_id should now be user_id + profile_id)
DROP INDEX IF EXISTS health_user_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS health_profile_id_key ON public.health(profile_id);

-- For user_medications table
DROP INDEX IF EXISTS user_medications_user_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS user_medications_profile_id_key ON public.user_medications(profile_id);

-- Add comments
COMMENT ON COLUMN public.health.profile_id IS 'Reference to the profile this health data belongs to';
COMMENT ON COLUMN public.medical_reports_processed.profile_id IS 'Reference to the profile this medical report belongs to';
COMMENT ON COLUMN public.user_medications.profile_id IS 'Reference to the profile these medications belong to';
COMMENT ON COLUMN public.medical_summaries_cache.profile_id IS 'Reference to the profile this summary belongs to';
