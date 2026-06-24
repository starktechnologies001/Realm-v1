-- SQL script to add Premium Membership System (Silver, Gold & Diamond Elite) to Nearo database

-- 1. Extend profiles table with premium features
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR DEFAULT 'free',
ADD COLUMN IF NOT EXISTS premium_theme VARCHAR DEFAULT 'default',
ADD COLUMN IF NOT EXISTS invisible_browsing BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS avatar_effect VARCHAR DEFAULT 'none',
ADD COLUMN IF NOT EXISTS thought_bubble_color VARCHAR DEFAULT NULL,
ADD COLUMN IF NOT EXISTS thought_bubble_style VARCHAR DEFAULT 'default',
ADD COLUMN IF NOT EXISTS streak_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS badges_list TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS hide_relationship_status BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS hide_online_status BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS hide_mood BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS hide_last_seen BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS hide_birthday BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS hide_institute BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS super_poke_count_today INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_super_poke_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS thought_boosted_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS daily_thought_boost_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_thought_boost_at TIMESTAMPTZ DEFAULT NULL,
-- Diamond Elite additions
ADD COLUMN IF NOT EXISTS diamond_poke_count_today INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_diamond_poke_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Create profile_views table
CREATE TABLE IF NOT EXISTS profile_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    viewer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Enable Row Level Security (RLS) on profile_views
ALTER TABLE profile_views ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies for profile_views
DROP POLICY IF EXISTS "Allow users to view visitors to their own profile" ON profile_views;
CREATE POLICY "Allow users to view visitors to their own profile" 
ON profile_views FOR SELECT 
USING (auth.uid() = profile_owner_id);

DROP POLICY IF EXISTS "Allow anyone to record a visit" ON profile_views;
CREATE POLICY "Allow anyone to record a visit" 
ON profile_views FOR INSERT 
WITH CHECK (auth.uid() = viewer_id);

-- 5. Add index for performance on queries
CREATE INDEX IF NOT EXISTS idx_profile_views_owner_id ON profile_views(profile_owner_id);
CREATE INDEX IF NOT EXISTS idx_profile_views_viewer_id ON profile_views(viewer_id);

-- 6. Add Super Poke & Diamond Poke columns to friendships
ALTER TABLE friendships
ADD COLUMN IF NOT EXISTS is_super_poke BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_diamond_poke BOOLEAN DEFAULT FALSE;

-- 7. Create crossing_paths table
CREATE TABLE IF NOT EXISTS crossing_paths (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_a_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    user_b_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    count INTEGER DEFAULT 1,
    last_crossed_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT unique_user_pair UNIQUE (user_a_id, user_b_id),
    CONSTRAINT user_pair_order CHECK (user_a_id < user_b_id)
);

-- 8. Enable RLS on crossing_paths
ALTER TABLE crossing_paths ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to view their own crossing paths" ON crossing_paths;
CREATE POLICY "Allow users to view their own crossing paths"
ON crossing_paths FOR SELECT
USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

DROP POLICY IF EXISTS "Allow anyone to insert/update crossing paths" ON crossing_paths;
CREATE POLICY "Allow anyone to insert/update crossing paths"
ON crossing_paths FOR ALL
USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

-- 9. Add indexes for crossing_paths
CREATE INDEX IF NOT EXISTS idx_crossing_paths_user_a ON crossing_paths(user_a_id);
CREATE INDEX IF NOT EXISTS idx_crossing_paths_user_b ON crossing_paths(user_b_id);

