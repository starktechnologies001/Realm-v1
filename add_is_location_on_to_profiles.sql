ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS is_location_on BOOLEAN DEFAULT TRUE;

-- Update existing users to true as baseline
UPDATE profiles SET is_location_on = TRUE WHERE is_location_on IS NULL;