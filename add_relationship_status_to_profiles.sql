-- Add relationship_status column if it doesn't exist
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS relationship_status TEXT;

-- Verify it exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' AND column_name = 'relationship_status';
