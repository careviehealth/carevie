-- Create profiles table for Netflix-style multi-profile support
-- Allows one authenticated user to have multiple sub-profiles (for family members)

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  avatar_type TEXT NOT NULL DEFAULT 'default',
  avatar_color TEXT,
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);

-- Ensure each user has only one primary profile
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_user_primary 
  ON public.profiles(user_id) 
  WHERE is_primary = TRUE;

-- Table to store user's last selected profile preference
CREATE TABLE IF NOT EXISTS public.user_profile_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,  
  last_selected_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profile_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles table
-- Users can view their own profiles
CREATE POLICY "Users can view their own profiles"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own profiles
CREATE POLICY "Users can create their own profiles"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own profiles
CREATE POLICY "Users can update their own profiles"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own profiles
CREATE POLICY "Users can delete their own profiles"
  ON public.profiles
  FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for user_profile_preferences table
-- Users can view their own preferences
CREATE POLICY "Users can view their own preferences"
  ON public.user_profile_preferences
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own preferences
CREATE POLICY "Users can insert their own preferences"
  ON public.user_profile_preferences
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own preferences
CREATE POLICY "Users can update their own preferences"
  ON public.user_profile_preferences
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Create a default primary profile for all existing users
DO $$
DECLARE
  user_record RECORD;
  new_profile_id UUID;
BEGIN
  FOR user_record IN 
    SELECT id, raw_user_meta_data->>'full_name' as full_name, phone
    FROM auth.users
  LOOP
    -- Create a default primary profile
    INSERT INTO public.profiles (user_id, name, avatar_type, avatar_color, is_primary)
    VALUES (
      user_record.id,
      COALESCE(user_record.full_name, 'Me'),
      'default',
      '#14b8a6',
      TRUE
    )
    RETURNING id INTO new_profile_id;
    
    -- Set as last selected profile
    INSERT INTO public.user_profile_preferences (user_id, last_selected_profile_id)
    VALUES (user_record.id, new_profile_id)
    ON CONFLICT (user_id) DO UPDATE
    SET last_selected_profile_id = new_profile_id;
  END LOOP;
END $$;

-- Function to automatically create a default profile for new users
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER AS $$
DECLARE
  new_profile_id UUID;
BEGIN
  -- Create a default primary profile for the new user
  INSERT INTO public.profiles (user_id, name, avatar_type, avatar_color, is_primary)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Me'),
    'default',
    '#14b8a6',
    TRUE
  )
  RETURNING id INTO new_profile_id;
  
  -- Set as last selected profile
  INSERT INTO public.user_profile_preferences (user_id, last_selected_profile_id)
  VALUES (NEW.id, new_profile_id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create default profile for new users
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_profile();

-- Add helpful comments
COMMENT ON TABLE public.profiles IS 'User sub-profiles for family member management (Netflix-style)';
COMMENT ON COLUMN public.profiles.avatar_type IS 'Predefined avatar type: default, adult_male, adult_female, child, boy, girl, elderly_male, elderly_female';
COMMENT ON COLUMN public.profiles.avatar_color IS 'Hex color for avatar background customization';
COMMENT ON COLUMN public.profiles.is_primary IS 'Flag indicating the primary/default profile for a user';
