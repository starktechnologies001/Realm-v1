-- Enable RLS on blocked_users table to be safe
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

-- 1. Allow users to see who they have blocked (Standard)
-- Drop to avoid conflict if exists with different name
DROP POLICY IF EXISTS "Users can view blocks they created" ON blocked_users;
CREATE POLICY "Users can view blocks they created"
ON blocked_users FOR SELECT
USING ( auth.uid() = blocker_id );

-- 2. Allow users to see who blocked them (REQUIRED for Mutual Map Hiding)
-- This allows User B to know User A blocked them, so User B's map can hide User A.
DROP POLICY IF EXISTS "Users can view who blocked them" ON blocked_users;
CREATE POLICY "Users can view who blocked them"
ON blocked_users FOR SELECT
USING ( auth.uid() = blocked_id );

-- 3. Allow users to delete (unblock) only their own blocks
DROP POLICY IF EXISTS "Users can unblock" ON blocked_users;
CREATE POLICY "Users can unblock"
ON blocked_users FOR DELETE
USING ( auth.uid() = blocker_id );

-- 4. Allow users to insert (block) only as themselves
DROP POLICY IF EXISTS "Users can block" ON blocked_users;
CREATE POLICY "Users can block"
ON blocked_users FOR INSERT
WITH CHECK ( auth.uid() = blocker_id );
