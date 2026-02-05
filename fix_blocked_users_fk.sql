-- Fix Foreign Key relationships to allow PostgREST joins with 'profiles' table

-- 1. Drop existing FKs to auth.users
ALTER TABLE blocked_users
DROP CONSTRAINT IF EXISTS blocked_users_blocked_id_fkey;

ALTER TABLE blocked_users
DROP CONSTRAINT IF EXISTS blocked_users_blocker_id_fkey;

-- 2. Add new FKs to public.profiles
-- This enables: .select('*, profile:profiles!blocked_id(*)')
ALTER TABLE blocked_users
ADD CONSTRAINT blocked_users_blocked_id_fkey
FOREIGN KEY (blocked_id) REFERENCES public.profiles(id)
ON DELETE CASCADE;

ALTER TABLE blocked_users
ADD CONSTRAINT blocked_users_blocker_id_fkey
FOREIGN KEY (blocker_id) REFERENCES public.profiles(id)
ON DELETE CASCADE;

-- 3. Verify Policies still hold (they use auth.uid() so they are fine)
-- The table structure remains id, blocker_id, blocked_id.
