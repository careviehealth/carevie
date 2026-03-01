-- Fix: Ensure trigger works with actual personal table schema
-- Actual schema: PRIMARY KEY (id), where id = auth.users UUID
-- profile_id is NOT NULL but is NOT a unique key

CREATE OR REPLACE FUNCTION public.handle_new_profile_personal()
RETURNS TRIGGER AS $$
BEGIN
  -- Create a personal table entry for the new profile
  -- PK is 'id' (references auth.users), not 'profile_id'
  INSERT INTO public.personal (
    profile_id,
    id,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,        -- profile_id (references profiles.id)
    NEW.user_id,   -- id (PK, references auth.users.id)
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
    SET profile_id = EXCLUDED.profile_id,
        updated_at = NOW()
  WHERE personal.profile_id IS NULL;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the profile creation
    RAISE WARNING 'Failed to create personal entry for profile %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT INSERT, SELECT, UPDATE ON public.personal TO authenticated;

-- Ensure the trigger is properly attached
DROP TRIGGER IF EXISTS on_profile_created_personal ON public.profiles;
CREATE TRIGGER on_profile_created_personal
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_profile_personal();

COMMENT ON FUNCTION public.handle_new_profile_personal() IS 'Auto-creates personal table entry for new profiles (with error handling)';

