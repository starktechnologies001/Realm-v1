-- SQL script to add subscription tracking columns to profiles and update sync trigger

-- 1. Add tracking columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS subscription_status VARCHAR DEFAULT NULL,
ADD COLUMN IF NOT EXISTS subscription_start TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS subscription_end TIMESTAMPTZ DEFAULT NULL;

-- 2. Update the sync_subscription_tier trigger function to sync all columns
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

-- 3. Re-apply the trigger to the subscriptions table (just to be safe)
DROP TRIGGER IF EXISTS trigger_sync_subscription_tier ON public.subscriptions;
CREATE TRIGGER trigger_sync_subscription_tier
AFTER INSERT OR UPDATE ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.sync_subscription_tier();
