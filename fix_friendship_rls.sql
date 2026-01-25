-- Allow users to update the 'chat_theme' of friendships they differ
-- This policy ensures that a user can only update a friendship if they are either the requester or receiver.

-- First, ensure RLS is enabled
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists to avoid conflicts (optional, safe to just create if new name)
DROP POLICY IF EXISTS "Users can update their own friendships" ON friendships;

-- Create policy
CREATE POLICY "Users can update their own friendships"
ON friendships
FOR UPDATE
USING (
    auth.uid() = requester_id OR auth.uid() = receiver_id
)
WITH CHECK (
    auth.uid() = requester_id OR auth.uid() = receiver_id
);

-- Note: The column 'chat_theme' must exist.
-- If you haven't run the previous migration, run this line too:
-- ALTER TABLE friendships ADD COLUMN IF NOT EXISTS chat_theme TEXT DEFAULT 'default';
