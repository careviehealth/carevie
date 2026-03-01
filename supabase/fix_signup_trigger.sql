-- ============================================================
-- FIX: Drop old trigger that inserts into personal WITHOUT profile_id
-- Run this in Supabase SQL Editor
-- ============================================================
-- The old trigger 'on_auth_user_created_personal' calls insert_personal_row()
-- which only inserts (id) without profile_id, violating NOT NULL constraint.
--
-- The new flow handles this correctly:
--   1. on_auth_user_created_profile → creates profile (with profile_id)
--   2. on_profile_created_personal  → creates personal entry WITH profile_id
-- ============================================================

-- Drop the old problematic trigger
DROP TRIGGER IF EXISTS on_auth_user_created_personal ON auth.users;

-- Optionally drop the old function too (no longer needed)
DROP FUNCTION IF EXISTS public.insert_personal_row();

-- Also ensure the on_profile_created_personal trigger is up to date
-- (uses ON CONFLICT (id) since PK is 'id', not 'profile_id')
CREATE OR REPLACE FUNCTION public.handle_new_profile_personal()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.personal (
    profile_id,
    id,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,        -- profile_id (from profiles.id)
    NEW.user_id,   -- id (PK, from auth.users.id)
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
    SET profile_id = EXCLUDED.profile_id,
        updated_at = NOW()
  WHERE personal.profile_id IS NULL
     OR personal.profile_id != EXCLUDED.profile_id;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to create personal entry for profile %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-attach trigger on profiles table
DROP TRIGGER IF EXISTS on_profile_created_personal ON public.profiles;
CREATE TRIGGER on_profile_created_personal
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_profile_personal();
