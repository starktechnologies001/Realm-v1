-- Enable RLS (ensure it is on)
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Drop existing update policy if it exists to clean up
DROP POLICY IF EXISTS "Users can update their own messages" ON messages;

-- Create policy to allow users to update messages they sent
CREATE POLICY "Users can update their own messages"
ON messages
FOR UPDATE
USING (auth.uid() = sender_id);

-- Verify policy creation
SELECT * FROM pg_policies WHERE tablename = 'messages';
