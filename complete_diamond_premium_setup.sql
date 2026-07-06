-- COMPLETE Diamond Premium Database Setup Script
-- Paste and run this script in your Supabase SQL Editor.

-- Extend profiles table with Diamond Premium customization columns
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS nearby_moment VARCHAR DEFAULT NULL,
ADD COLUMN IF NOT EXISTS nearby_moment_expires_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS profile_music VARCHAR DEFAULT NULL,
ADD COLUMN IF NOT EXISTS profile_music_title VARCHAR DEFAULT NULL,
ADD COLUMN IF NOT EXISTS avatar_accessory VARCHAR DEFAULT 'none',
ADD COLUMN IF NOT EXISTS avatar_outfit VARCHAR DEFAULT 'none',
ADD COLUMN IF NOT EXISTS username_effect VARCHAR DEFAULT 'none',
ADD COLUMN IF NOT EXISTS app_icon VARCHAR DEFAULT 'default',
ADD COLUMN IF NOT EXISTS chat_bubble_style VARCHAR DEFAULT 'default',
ADD COLUMN IF NOT EXISTS profile_background_style VARCHAR DEFAULT 'default';

-- Create index on nearby_moment_expires_at for performance
CREATE INDEX IF NOT EXISTS idx_profiles_nearby_moment_expiry ON public.profiles(nearby_moment_expires_at);
