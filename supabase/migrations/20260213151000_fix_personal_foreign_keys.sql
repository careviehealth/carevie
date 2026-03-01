-- Fix foreign key constraints after changing personal table primary key
-- The old constraints reference personal(id) which is no longer the primary key

-- Step 1: Drop old foreign key constraint from personal table
ALTER TABLE public.personal
  DROP CONSTRAINT IF EXISTS credentials_id_fkey;

-- Step 2: Check and fix any tables referencing personal(id)
-- user_profiles table has a FK to personal(id) that needs to be dropped
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'user_profiles_user_id_fkey' 
    AND table_name = 'user_profiles'
  ) THEN
    ALTER TABLE public.user_profiles
      DROP CONSTRAINT user_profiles_user_id_fkey;
  END IF;
END $$;

-- Step 3: Add correct foreign key - id still references auth.users
-- but it's not the primary key anymore
ALTER TABLE public.personal
  ADD CONSTRAINT personal_user_id_fkey 
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Step 4: Ensure personal table has correct indexes
CREATE INDEX IF NOT EXISTS idx_personal_user_id ON public.personal(id);
CREATE INDEX IF NOT EXISTS idx_personal_profile_id ON public.personal(profile_id);

-- Add helpful comment
COMMENT ON CONSTRAINT personal_user_id_fkey ON public.personal IS 'References the authenticated user (not primary key)';
