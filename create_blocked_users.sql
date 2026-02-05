-- 1. Create blocked_users table
CREATE TABLE IF NOT EXISTS blocked_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    blocker_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    blocked_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(blocker_id, blocked_id)
);

-- 2. Enable RLS
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies for blocked_users table
CREATE POLICY "Users can view who they blocked"
ON blocked_users FOR SELECT
USING (auth.uid() = blocker_id);

CREATE POLICY "Users can block others"
ON blocked_users FOR INSERT
WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "Users can unblock"
ON blocked_users FOR DELETE
USING (auth.uid() = blocker_id);

-- 4. Helper Function to check block status efficiently
CREATE OR REPLACE FUNCTION is_blocked_by(target_user_id UUID, potential_blocker_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM blocked_users
    WHERE blocker_id = potential_blocker_id
    AND blocked_id = target_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Update Messages Policy (Filter out blocked messages)
-- We drop existing policy first to avoid conflict if it exists with same name, or just create a new specific one.
-- Best practice: Add a specific "Block Filter" policy if "PERMISSIVE" (default).
-- But standard policies are RESTRICTIVE (only allowing what is explicitly matched).
-- So we need to modify the "View" policy to exclude blocked.
-- Assuming existing policy is broad allow for sender/receiver.
-- We will DROP and RECREATE the standard view policy.

DROP POLICY IF EXISTS "Users can view their own messages" ON messages;

CREATE POLICY "Users can view their own messages"
ON messages FOR SELECT
USING (
  (auth.uid() = sender_id) 
  OR 
  (auth.uid() = receiver_id AND NOT is_blocked_by(sender_id, auth.uid()))
);

-- Note: We generally ALLOW insertion even if blocked, but preventing VIEWING is what achieves the "Single Tick" (Undelivered) effect for the receiver.
-- The sender inserts success. The receiver selects -> returns nothing.

-- 6. Update Calls Policy
DROP POLICY IF EXISTS "Users can view their own calls" ON calls;

CREATE POLICY "Users can view their own calls"
ON calls FOR SELECT
USING (
  (auth.uid() = caller_id) 
  OR 
  (auth.uid() = receiver_id AND NOT is_blocked_by(caller_id, auth.uid()))
);
