-- create_subscriptions_table.sql

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
CREATE POLICY "Users can view their own subscriptions"
ON public.subscriptions
FOR SELECT
USING (auth.uid() = user_id);

-- Ensure profiles.subscription_tier is in sync when a subscription is added/updated
CREATE OR REPLACE FUNCTION sync_subscription_tier()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'active' THEN
        UPDATE public.profiles
        SET subscription_tier = NEW.plan
        WHERE id = NEW.user_id;
    ELSIF NEW.status = 'expired' OR NEW.status = 'cancelled' THEN
        -- Only reset to free if this is their latest subscription record
        -- (Optional advanced logic could go here, but a simple reset works)
        UPDATE public.profiles
        SET subscription_tier = 'free'
        WHERE id = NEW.user_id AND subscription_tier = NEW.plan;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_subscription_tier ON public.subscriptions;
CREATE TRIGGER trigger_sync_subscription_tier
AFTER INSERT OR UPDATE ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION sync_subscription_tier();

-- Set up pg_cron to auto-expire subscriptions daily (Requires pg_cron extension)
-- Note: If you cannot use pg_cron on your Supabase tier, you can set up an Edge Function 
-- triggered daily via an external cron service (like GitHub Actions or Vercel Cron).
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule('expire-subscriptions', '0 0 * * *', $$
--     UPDATE public.subscriptions
--     SET status = 'expired'
--     WHERE status = 'active' AND expires_at < NOW();
-- $$);
