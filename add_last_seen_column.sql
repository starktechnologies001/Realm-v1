-- Add show_last_seen column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS show_last_seen BOOLEAN DEFAULT true;

-- Update existing rows to have true
UPDATE profiles SET show_last_seen = true WHERE show_last_seen IS NULL;
