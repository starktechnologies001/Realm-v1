-- Add last_location column to profiles table if it doesn't exist
-- This is required for the LocationContext.jsx updates to work
BEGIN;
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_name = 'profiles' 
      AND column_name = 'last_location'
    ) THEN
      -- Create column as geography point (standard for PostGIS locations)
      -- If PostGIS is not available, we can fallback to text, but try geography first
      -- Assuming PostGIS is enabled on Supabase by default
      ALTER TABLE profiles ADD COLUMN last_location geography(POINT);
      
      -- Create index for faster spatial queries
      CREATE INDEX IF NOT EXISTS profiles_last_location_idx ON profiles USING GIST (last_location);
    END IF;
  END
  $$;
COMMIT;

-- Verify column existence
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name = 'last_location';
