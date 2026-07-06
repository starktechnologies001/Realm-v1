-- COMPLETE Nearo Premium Database Setup Script (Silver, Gold, and Diamond Elite)
-- Paste and run this script in your Supabase SQL Editor.

-- 1. Create subscriptions table
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    plan TEXT NOT NULL CHECK (plan IN ('free', 'silver', 'gold', 'diamond')),
    status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'cancelled')),
    payment_id TEXT,
    order_id TEXT,
    amount_paid INTEGER,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

-- Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own subscriptions
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON public.subscriptions;
CREATE POLICY "Users can view their own subscriptions"
ON public.subscriptions
FOR SELECT
USING (auth.uid() = user_id);

-- 2. Extend profiles table with premium and privacy columns
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR DEFAULT 'free',
ADD COLUMN IF NOT EXISTS subscription_status VARCHAR DEFAULT NULL,
ADD COLUMN IF NOT EXISTS subscription_start TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS subscription_end TIMESTAMPTZ DEFAULT NULL,
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
ADD COLUMN IF NOT EXISTS hide_distance BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS hide_active_status BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS profile_view_policy VARCHAR DEFAULT 'everyone' CHECK (profile_view_policy IN ('everyone', 'friends', 'nobody'));

-- 3. Create profile_views table
CREATE TABLE IF NOT EXISTS public.profile_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    viewer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on profile_views
ALTER TABLE public.profile_views ENABLE ROW LEVEL SECURITY;

-- Policies for profile_views
DROP POLICY IF EXISTS "Allow users to view visitors to their own profile" ON public.profile_views;
CREATE POLICY "Allow users to view visitors to their own profile" 
ON public.profile_views FOR SELECT 
USING (auth.uid() = profile_owner_id);

DROP POLICY IF EXISTS "Allow anyone to record a visit" ON public.profile_views;
CREATE POLICY "Allow anyone to record a visit" 
ON public.profile_views FOR INSERT 
WITH CHECK (auth.uid() = viewer_id);

CREATE INDEX IF NOT EXISTS idx_profile_views_owner_id ON public.profile_views(profile_owner_id);
CREATE INDEX IF NOT EXISTS idx_profile_views_viewer_id ON public.profile_views(viewer_id);

-- 4. Create thought_views table to track views on thoughts
CREATE TABLE IF NOT EXISTS public.thought_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thought_owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    viewer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on thought_views
ALTER TABLE public.thought_views ENABLE ROW LEVEL SECURITY;

-- Policies for thought_views
DROP POLICY IF EXISTS "Allow users to view thought views of their own thoughts" ON public.thought_views;
CREATE POLICY "Allow users to view thought views of their own thoughts"
ON public.thought_views FOR SELECT
USING (auth.uid() = thought_owner_id);

DROP POLICY IF EXISTS "Allow anyone to record a thought view" ON public.thought_views;
CREATE POLICY "Allow anyone to record a thought view"
ON public.thought_views FOR INSERT
WITH CHECK (auth.uid() = viewer_id);

CREATE INDEX IF NOT EXISTS idx_thought_views_owner ON public.thought_views(thought_owner_id);
CREATE INDEX IF NOT EXISTS idx_thought_views_viewer ON public.thought_views(viewer_id);

-- 5. Create crossing_paths table
CREATE TABLE IF NOT EXISTS public.crossing_paths (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_a_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    user_b_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    count INTEGER DEFAULT 1,
    last_crossed_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT unique_user_pair UNIQUE (user_a_id, user_b_id),
    CONSTRAINT user_pair_order CHECK (user_a_id < user_b_id)
);

-- Enable RLS on crossing_paths
ALTER TABLE public.crossing_paths ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to view their own crossing paths" ON public.crossing_paths;
CREATE POLICY "Allow users to view their own crossing paths"
ON public.crossing_paths FOR SELECT
USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

DROP POLICY IF EXISTS "Allow anyone to insert/update crossing paths" ON public.crossing_paths;
CREATE POLICY "Allow anyone to insert/update crossing paths"
ON public.crossing_paths FOR ALL
USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

CREATE INDEX IF NOT EXISTS idx_crossing_paths_user_a ON public.crossing_paths(user_a_id);
CREATE INDEX IF NOT EXISTS idx_crossing_paths_user_b ON public.crossing_paths(user_b_id);

-- 6. Trigger to sync subscription tier and values to profiles table
CREATE OR REPLACE FUNCTION public.sync_subscription_tier()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'active' THEN
        UPDATE public.profiles
        SET subscription_tier = NEW.plan,
            subscription_status = NEW.status,
            subscription_start = NEW.started_at,
            subscription_end = NEW.expires_at
        WHERE id = NEW.user_id;
    ELSIF NEW.status = 'expired' OR NEW.status = 'cancelled' THEN
        -- Safely reset all premium customizations, themes, rings, and advanced privacy settings to defaults
        UPDATE public.profiles
        SET subscription_tier = 'free',
            subscription_status = NEW.status,
            subscription_start = NULL,
            subscription_end = NULL,
            thought_bubble_style = 'default',
            avatar_effect = 'none',
            invisible_browsing = FALSE,
            hide_relationship_status = FALSE,
            hide_online_status = FALSE,
            hide_mood = FALSE,
            hide_last_seen = FALSE,
            hide_birthday = FALSE,
            hide_institute = FALSE,
            hide_distance = FALSE,
            hide_active_status = FALSE,
            profile_view_policy = 'everyone'
        WHERE id = NEW.user_id AND subscription_tier = NEW.plan;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_subscription_tier ON public.subscriptions;
CREATE TRIGGER trigger_sync_subscription_tier
AFTER INSERT OR UPDATE ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.sync_subscription_tier();

-- 7. Subscription Expiration check function
CREATE OR REPLACE FUNCTION public.check_and_expire_subscriptions()
RETURNS void AS $$
BEGIN
    UPDATE public.subscriptions
    SET status = 'expired'
    WHERE status = 'active' AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.check_and_expire_subscriptions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_expire_subscriptions() TO anon;

-- 8. Enable pg_cron and schedule background checking job
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('expire-subscriptions-job') 
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-subscriptions-job');

SELECT cron.schedule(
    'expire-subscriptions-job',
    '0 * * * *', 
    'SELECT public.check_and_expire_subscriptions();'
);
