-- Enable Realtime for profiles table
-- This is critical for the map to update when other users move
BEGIN;
  -- wrapper to safely add table to publication
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 
      FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND tablename = 'profiles'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
    END IF;
  END
  $$;
COMMIT;

-- Ensure RLS allows reading profiles so updates are broadcasted
-- Realtime respects RLS: if a user can't SELECT a row, they won't get UPDATEs for it.
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 1. Read Policy: Allow authenticated users to see all profiles
-- Note: Logic for "Ghost Mode" is handled in the frontend (MapHome.jsx filters them out),
-- but we must allow the data to reach the client first.
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
CREATE POLICY "Public profiles are viewable by everyone"
ON profiles FOR SELECT
TO authenticated
USING (true);

-- 2. Update Policy: Users can update their own location
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 3. Insert Policy: Users can insert their own profile (usually handled by triggers on auth.users, but good to have)
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);
