-- Migration to move relationship status data from 'status' to 'relationship_status' column
-- Run this in your Supabase SQL Editor

UPDATE profiles
SET 
  relationship_status = status, 
  status = 'Available'
WHERE 
  status IN ('Single', 'Married', 'Committed', 'Open to Date', 'Engaged', 'In a Relationship', 'It''s Complicated')
  AND (relationship_status IS NULL OR relationship_status = '');

-- Verify the update
SELECT username, status, relationship_status FROM profiles WHERE relationship_status IS NOT NULL;
