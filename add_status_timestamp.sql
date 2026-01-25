-- Add status_updated_at column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create a policy or index if needed (optional for now)
-- We rely on existing RLS for UPDATE access
