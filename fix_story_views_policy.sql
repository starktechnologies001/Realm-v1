-- Fix RLS: Users need to see their own views to know what they've watched
DROP POLICY IF EXISTS "Users can see their own views" ON story_views;

CREATE POLICY "Users can see their own views"
ON story_views FOR SELECT
USING (auth.uid() = viewer_id);
