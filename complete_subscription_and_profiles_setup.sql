-- COMPLETE Nearo Subscription Database Setup Script
-- Paste and run this script in your Supabase SQL Editor.

-- 1. Create subscriptions table if not exists
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

-- 2. Add tracking columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS subscription_status VARCHAR DEFAULT NULL,
ADD COLUMN IF NOT EXISTS subscription_start TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS subscription_end TIMESTAMPTZ DEFAULT NULL;

-- 3. Update the sync_subscription_tier trigger function to sync all columns
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
        UPDATE public.profiles
        SET subscription_tier = 'free',
            subscription_status = NEW.status,
            subscription_start = NULL,
            subscription_end = NULL
        WHERE id = NEW.user_id AND subscription_tier = NEW.plan;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Re-apply the trigger to the subscriptions table
DROP TRIGGER IF EXISTS trigger_sync_subscription_tier ON public.subscriptions;
CREATE TRIGGER trigger_sync_subscription_tier
AFTER INSERT OR UPDATE ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.sync_subscription_tier();
