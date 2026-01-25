-- MASTER FIX FOR SHARED CHAT THEMES (UPDATED)
-- Run this entire script in the Supabase SQL Editor

-- 1. Ensure the column exists (Safe to run multiple times)
ALTER TABLE friendships 
ADD COLUMN IF NOT EXISTS chat_theme TEXT DEFAULT 'default';

COMMENT ON COLUMN friendships.chat_theme IS 'Shared theme identifier for the chat room';

-- 2. Enable Row Level Security
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

-- 3. Create/Replace Policies
-- We drop existing policies to avoid conflicts or stale logic
DROP POLICY IF EXISTS "Users can view their own friendships" ON friendships;
DROP POLICY IF EXISTS "Users can update their own friendships" ON friendships;
DROP POLICY IF EXISTS "Users can insert their own friendships" ON friendships;

-- SELECT Policy
CREATE POLICY "Users can view their own friendships"
ON friendships FOR SELECT
USING (
    auth.uid() = requester_id OR auth.uid() = receiver_id
);

-- UPDATE Policy
CREATE POLICY "Users can update their own friendships"
ON friendships FOR UPDATE
USING (
    auth.uid() = requester_id OR auth.uid() = receiver_id
)
WITH CHECK (
    auth.uid() = requester_id OR auth.uid() = receiver_id
);

-- INSERT Policy
CREATE POLICY "Users can insert their own friendships"
ON friendships FOR INSERT
WITH CHECK (
    auth.uid() = requester_id
);

-- 4. Enable Realtime Replication (SAFE VERSION)
-- We wrap this in a block to ignore the error if it's already added.
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE friendships;
    EXCEPTION
        WHEN duplicate_object OR sqlstate '42710' THEN
            RAISE NOTICE 'Table "friendships" is already in publication "supabase_realtime"';
    END;
END $$;

-- 5. Grant permissions
GRANT ALL ON friendships TO authenticated;
GRANT ALL ON friendships TO service_role;
