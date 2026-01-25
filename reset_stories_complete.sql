-- COMPLETE RESET OF STORIES TABLE
-- Run this if you have conflicting columns like 'image_url' vs 'media_url'

-- 1. Drop the existing tables completely to clear bad schema
DROP TABLE IF EXISTS story_views CASCADE;
DROP TABLE IF EXISTS stories CASCADE;

-- 2. Re-create Stories Table (Correct Schema)
CREATE TABLE stories (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    media_url TEXT NOT NULL,
    caption TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
);

-- 3. Re-create Story Views Table
CREATE TABLE story_views (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    story_id UUID REFERENCES stories(id) ON DELETE CASCADE NOT NULL,
    viewer_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    viewed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(story_id, viewer_id)
);

-- 4. Re-enable RLS
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_views ENABLE ROW LEVEL SECURITY;

-- 5. Re-apply Policies

-- Stories Policies
CREATE POLICY "Users can create their own stories" 
ON stories FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own stories" 
ON stories FOR DELETE 
USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can read active stories" 
ON stories FOR SELECT 
USING (
    auth.role() = 'authenticated' 
    AND expires_at > NOW()
);

-- Views Policies
CREATE POLICY "Users can record views" 
ON story_views FOR INSERT 
WITH CHECK (auth.uid() = viewer_id);

CREATE POLICY "Story owners can see views" 
ON story_views FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM stories 
        WHERE stories.id = story_views.story_id 
        AND stories.user_id = auth.uid()
    )
);

-- 6. Indexes
CREATE INDEX idx_stories_user_expires ON stories(user_id, expires_at);
CREATE INDEX idx_story_views_story ON story_views(story_id);
