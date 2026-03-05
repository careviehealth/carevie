-- Persist one-time onboarding tour visibility per account.
ALTER TABLE public.user_profile_preferences
  ADD COLUMN IF NOT EXISTS has_seen_onboarding_tour boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_tour_seen_at timestamptz;

-- Existing accounts should not auto-run the onboarding tour after deploy.
UPDATE public.user_profile_preferences
SET has_seen_onboarding_tour = true,
    onboarding_tour_seen_at = COALESCE(onboarding_tour_seen_at, now()),
    updated_at = now()
WHERE has_seen_onboarding_tour = false;
