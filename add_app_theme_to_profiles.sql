-- Add app_theme column to profiles table if it doesn't exist
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS app_theme TEXT DEFAULT 'light';

-- Add comment
COMMENT ON COLUMN profiles.app_theme IS 'Application theme preference (light, dark, system)';
