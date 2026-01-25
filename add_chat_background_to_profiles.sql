-- Add chat_background column to profiles table if it doesn't exist
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS chat_background TEXT;

-- Add comment
COMMENT ON COLUMN profiles.chat_background IS 'URL or CSS value for custom chat wallpaper';
