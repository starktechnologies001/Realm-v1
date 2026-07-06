-- SQL migration to support Gold Premium Membership (Advanced Privacy, Analytics, Super Pokes)
-- Paste and run this in your Supabase SQL Editor.

-- 1. Extend profiles with advanced privacy controls and daily poke limits
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS hide_distance BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS hide_active_status BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS profile_view_policy VARCHAR DEFAULT 'everyone' CHECK (profile_view_policy IN ('everyone', 'friends', 'nobody'));

-- 2. Create thought_views table to track views on premium thoughts
CREATE TABLE IF NOT EXISTS public.thought_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thought_owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    viewer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on thought_views
ALTER TABLE public.thought_views ENABLE ROW LEVEL SECURITY;

-- RLS policies for thought_views
DROP POLICY IF EXISTS "Allow users to view thought views of their own thoughts" ON public.thought_views;
CREATE POLICY "Allow users to view thought views of their own thoughts"
ON public.thought_views FOR SELECT
USING (auth.uid() = thought_owner_id);

DROP POLICY IF EXISTS "Allow anyone to record a thought view" ON public.thought_views;
CREATE POLICY "Allow anyone to record a thought view"
ON public.thought_views FOR INSERT
WITH CHECK (auth.uid() = viewer_id);

-- Performance indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_thought_views_owner ON public.thought_views(thought_owner_id);
CREATE INDEX IF NOT EXISTS idx_thought_views_viewer ON public.thought_views(viewer_id);

-- 3. Modify trigger trigger_sync_subscription_tier to reset advanced privacy settings on expiration
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
        -- Safely reset all premium customization & visibility flags on expiry
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
