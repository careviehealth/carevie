ALTER TABLE public.user_profile_preferences
  ADD COLUMN IF NOT EXISTS selected_theme text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profile_preferences_selected_theme_check'
      AND conrelid = 'public.user_profile_preferences'::regclass
  ) THEN
    ALTER TABLE public.user_profile_preferences
      ADD CONSTRAINT user_profile_preferences_selected_theme_check
      CHECK (
        selected_theme IS NULL
        OR selected_theme = ANY (
          ARRAY[
            'default',
            'charcoal',
            'clay',
            'olive',
            'coffee',
            'ocean',
            'sunset',
            'lemon',
            'lavender',
            'cherryblue'
          ]::text[]
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN public.user_profile_preferences.selected_theme IS
  'Saved account theme for cross-device theme restoration.';
