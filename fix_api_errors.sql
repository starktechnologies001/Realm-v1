-- Fix 1: Add missing UPDATE policy for push_subscriptions (Required for UPSERT operations)

-- Drop existing policy if it exists to clean slate
DROP POLICY IF EXISTS "Users can update their own subscriptions" ON public.push_subscriptions;

-- Create the Update policy
CREATE POLICY "Users can update their own subscriptions"
    ON public.push_subscriptions FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Fix 2: Ensure Profiles location columns are correct type and nullable
-- This fixes potential 400 errors during location updates

-- We use DO block to safer execution validation if needed, but direct ALTER is fine here
ALTER TABLE public.profiles 
    ALTER COLUMN latitude DROP NOT NULL,
    ALTER COLUMN longitude DROP NOT NULL;

ALTER TABLE public.profiles 
    ALTER COLUMN latitude TYPE double precision USING latitude::double precision;

ALTER TABLE public.profiles 
    ALTER COLUMN longitude TYPE double precision USING longitude::double precision;

ALTER TABLE public.profiles 
    ALTER COLUMN last_active TYPE timestamptz USING last_active::timestamptz;
