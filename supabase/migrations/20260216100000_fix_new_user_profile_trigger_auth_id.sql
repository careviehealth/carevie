-- Fix signup trigger after profiles.auth_id became required.
-- Without this, inserts into auth.users can fail with
-- "null value in column auth_id of relation profiles violates not-null constraint".

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER AS $$
DECLARE
  new_profile_id UUID;
BEGIN
  INSERT INTO public.profiles (user_id, auth_id, name, avatar_type, avatar_color, is_primary)
  VALUES (
    NEW.id,
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Me'),
    'default',
    '#14b8a6',
    TRUE
  )
  RETURNING id INTO new_profile_id;

  INSERT INTO public.user_profile_preferences (user_id, last_selected_profile_id)
  VALUES (NEW.id, new_profile_id)
  ON CONFLICT (user_id) DO UPDATE
  SET last_selected_profile_id = EXCLUDED.last_selected_profile_id,
      updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.handle_new_user_profile() IS
  'Creates default profile and preference row for new auth users (sets both profiles.user_id and profiles.auth_id).';

COMMIT;
