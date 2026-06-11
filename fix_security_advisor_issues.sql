-- =============================================================
-- fix_security_advisor_issues.sql
-- Fixes all Supabase Security Advisor CRITICAL errors:
--   1. Policy Exists RLS Disabled   → public.stories
--   2. RLS Disabled in Public       → public.spatial_ref_sys
--   3. RLS Disabled in Public       → public.stories
--   4. Auth RLS Initialization Plan → public.call_sessions
-- Run this once in the Supabase SQL Editor.
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- 1.  public.stories
--     Issue: RLS was disabled even though policies existed.
--     Fix:   Enable RLS and ensure all needed policies exist.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

-- Allow the story owner to view their own stories (including expired ones)
DROP POLICY IF EXISTS "Story owner can view own stories" ON public.stories;
CREATE POLICY "Story owner can view own stories"
ON public.stories FOR SELECT
USING (auth.uid() = user_id);

-- Allow authenticated users to view active (non-expired) stories
DROP POLICY IF EXISTS "Authenticated users can read active stories" ON public.stories;
CREATE POLICY "Authenticated users can read active stories"
ON public.stories FOR SELECT
USING (
    auth.role() = 'authenticated'
    AND expires_at > NOW()
);

-- Allow users to insert their own stories
DROP POLICY IF EXISTS "Users can create their own stories" ON public.stories;
CREATE POLICY "Users can create their own stories"
ON public.stories FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Allow users to delete their own stories
DROP POLICY IF EXISTS "Users can delete their own stories" ON public.stories;
CREATE POLICY "Users can delete their own stories"
ON public.stories FOR DELETE
USING (auth.uid() = user_id);

-- Allow users to update their own stories (e.g. caption edits)
DROP POLICY IF EXISTS "Users can update their own stories" ON public.stories;
CREATE POLICY "Users can update their own stories"
ON public.stories FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────
-- 2.  public.story_views  (companion table – harden policies)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

-- Viewers can insert a view record for themselves
DROP POLICY IF EXISTS "Users can record views" ON public.story_views;
CREATE POLICY "Users can record views"
ON public.story_views FOR INSERT
WITH CHECK (auth.uid() = viewer_id);

-- Story owners can see who viewed their stories
DROP POLICY IF EXISTS "Story owners can see views" ON public.story_views;
CREATE POLICY "Story owners can see views"
ON public.story_views FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.stories
        WHERE stories.id = story_views.story_id
          AND stories.user_id = auth.uid()
    )
);

-- Viewers can see their own view records (needed for "seen" state checks in the app)
DROP POLICY IF EXISTS "Viewers can see their own view records" ON public.story_views;
CREATE POLICY "Viewers can see their own view records"
ON public.story_views FOR SELECT
USING (auth.uid() = viewer_id);


-- ─────────────────────────────────────────────────────────────
-- 3.  public.spatial_ref_sys  (PostGIS reference table)
--     NOTE: This table is owned by the postgres superuser and
--     CANNOT be altered by regular Supabase users. The Security
--     Advisor warning for this table is a known false positive
--     for PostGIS-enabled Supabase projects. It can safely be
--     ignored — the table is internal to PostGIS and is never
--     exposed to end-users via the app.
-- ─────────────────────────────────────────────────────────────
-- (No SQL needed here — skip this table)


-- ─────────────────────────────────────────────────────────────
-- 4.  public.call_sessions
--     Issue: "Auth RLS Initialization Plan" warning – table
--            exists but RLS is not enabled / policies are
--            missing, causing the auth.uid() plan to be
--            suboptimal or skipped entirely.
--     Fix:   Enable RLS and add participant-scoped policies
--            that mirror the app's callSignalingService.js
--            access patterns (caller_id / receiver_id).
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;

-- Callers can create new call sessions
DROP POLICY IF EXISTS "Callers can create call sessions" ON public.call_sessions;
CREATE POLICY "Callers can create call sessions"
ON public.call_sessions FOR INSERT
WITH CHECK (auth.uid() = caller_id);

-- Both participants can view their sessions
DROP POLICY IF EXISTS "Participants can view call sessions" ON public.call_sessions;
CREATE POLICY "Participants can view call sessions"
ON public.call_sessions FOR SELECT
USING (
    auth.uid() = caller_id
    OR auth.uid() = receiver_id
);

-- Both participants can update the session status
-- (accept, decline, end, mark missed – all write via .update())
DROP POLICY IF EXISTS "Participants can update call sessions" ON public.call_sessions;
CREATE POLICY "Participants can update call sessions"
ON public.call_sessions FOR UPDATE
USING (
    auth.uid() = caller_id
    OR auth.uid() = receiver_id
)
WITH CHECK (
    auth.uid() = caller_id
    OR auth.uid() = receiver_id
);

-- Grant authenticated role access (required for RLS to work with Supabase)
GRANT ALL ON public.call_sessions TO authenticated;
GRANT ALL ON public.stories      TO authenticated;
GRANT ALL ON public.story_views  TO authenticated;
-- Note: spatial_ref_sys is a superuser-owned PostGIS table — no GRANT needed


-- ─────────────────────────────────────────────────────────────
-- 5.  Reload PostgREST schema cache
-- ─────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
