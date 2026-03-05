BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER AS $$
DECLARE
  new_profile_id UUID;
  resolved_full_name TEXT;
BEGIN
  resolved_full_name := COALESCE(
    NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''),
    'Profile'
  );

  INSERT INTO public.profiles (user_id, auth_id, name, avatar_type, avatar_color, is_primary)
  VALUES (
    NEW.id,
    NEW.id,
    resolved_full_name,
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

WITH me_profiles AS (
  SELECT
    id,
    CASE
      WHEN NULLIF(btrim(display_name), '') IS NOT NULL
        AND lower(btrim(display_name)) <> 'me'
        THEN btrim(display_name)
      WHEN NULLIF(btrim(name), '') IS NOT NULL
        AND lower(btrim(name)) <> 'me'
        THEN btrim(name)
      ELSE 'Profile'
    END AS resolved_name
  FROM public.profiles
  WHERE lower(btrim(COALESCE(name, ''))) = 'me'
     OR lower(btrim(COALESCE(display_name, ''))) = 'me'
)
UPDATE public.profiles AS profile
SET
  name = me_profiles.resolved_name,
  display_name = me_profiles.resolved_name,
  updated_at = NOW()
FROM me_profiles
WHERE profile.id = me_profiles.id;

COMMIT;
