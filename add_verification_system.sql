-- ============================================================
-- Blue Verified Badge System — Database Migration
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Step 1: Add verification columns to profiles table
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_verified        BOOLEAN   NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS verification_status TEXT      DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS verification_type   TEXT      DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS verified_at         TIMESTAMPTZ DEFAULT NULL;

-- Step 2: Add index for fast filtering of verified users
CREATE INDEX IF NOT EXISTS idx_profiles_is_verified ON profiles (is_verified) WHERE is_verified = TRUE;

-- Step 3: Ensure all existing rows have correct defaults
UPDATE profiles SET is_verified = FALSE WHERE is_verified IS NULL;

-- Step 4: Verify columns were added
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND column_name IN ('is_verified','verification_status','verification_type','verified_at')
ORDER BY column_name;
