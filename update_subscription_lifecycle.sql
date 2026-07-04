-- update_subscription_lifecycle.sql
-- Run this in your Supabase SQL Editor to enable automatic subscription expiration.

-- 1. Create a function to check and expire subscriptions
-- Defined as SECURITY DEFINER so that it can run with admin privileges to update subscriptions and profiles
-- even when called by regular users (as a fallback).
CREATE OR REPLACE FUNCTION public.check_and_expire_subscriptions()
RETURNS void AS $$
BEGIN
    -- Update subscriptions table to set status to 'expired' where expires_at is in the past.
    -- The trigger trigger_sync_subscription_tier on subscriptions will automatically
    -- update profiles.subscription_tier to 'free' when status becomes 'expired'.
    UPDATE public.subscriptions
    SET status = 'expired'
    WHERE status = 'active' AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution permission to authenticated users so they can run it on app load
GRANT EXECUTE ON FUNCTION public.check_and_expire_subscriptions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_expire_subscriptions() TO anon;

-- 2. Enable pg_cron and schedule it to run every hour (Background sweeper)
-- Note: pg_cron is supported on all standard Supabase cloud projects.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Unschedule first if it exists to prevent duplicate schedules
SELECT cron.unschedule('expire-subscriptions-job') 
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-subscriptions-job');

-- Schedule the job to run every hour at minute 0
SELECT cron.schedule(
    'expire-subscriptions-job',
    '0 * * * *', 
    'SELECT public.check_and_expire_subscriptions();'
);
