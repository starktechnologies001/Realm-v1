-- Create Stories Table
CREATE TABLE IF NOT EXISTS stories (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    media_url TEXT NOT NULL,
    caption TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
);

-- Enable RLS
ALTER TABLE stories DISABLE ROW LEVEL SECURITY; -- Reset first given development flux
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;

-- Create Story Views Table (Analytics + "Seen" state)
CREATE TABLE IF NOT EXISTS story_views (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    story_id UUID REFERENCES stories(id) ON DELETE CASCADE NOT NULL,
    viewer_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    viewed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(story_id, viewer_id) -- One view per user per story
);

ALTER TABLE story_views ENABLE ROW LEVEL SECURITY;

-- Policies for Stories

-- 1. Everyone can create their own stories
DROP POLICY IF EXISTS "Users can create their own stories" ON stories;
CREATE POLICY "Users can create their own stories" 
ON stories FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- 2. Users can delete their own stories
DROP POLICY IF EXISTS "Users can delete their own stories" ON stories;
CREATE POLICY "Users can delete their own stories" 
ON stories FOR DELETE 
USING (auth.uid() = user_id);

-- 3. Authenticated users can read active stories
DROP POLICY IF EXISTS "Authenticated users can read active stories" ON stories;
CREATE POLICY "Authenticated users can read active stories" 
ON stories FOR SELECT 
USING (
    auth.role() = 'authenticated' 
    AND expires_at > NOW() -- Only show non-expired
);

-- Policies for Story Views

-- 1. Users can mark a story as viewed (Insert)
DROP POLICY IF EXISTS "Users can record views" ON story_views;
CREATE POLICY "Users can record views" 
ON story_views FOR INSERT 
WITH CHECK (auth.uid() = viewer_id);

-- 2. Story owners can see who viewed their story
DROP POLICY IF EXISTS "Story owners can see views" ON story_views;
CREATE POLICY "Story owners can see views" 
ON story_views FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM stories 
        WHERE stories.id = story_views.story_id 
        AND stories.user_id = auth.uid()
    )
);

-- Indexes for Performance
CREATE INDEX idx_stories_user_expires ON stories(user_id, expires_at);
CREATE INDEX idx_story_views_story ON story_views(story_id);
