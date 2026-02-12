-- Rename 'auth' to 'auth_key' to avoid keyword conflicts with Supabase 'auth' schema
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'push_subscriptions' AND column_name = 'auth') THEN
        ALTER TABLE public.push_subscriptions RENAME COLUMN "auth" TO "auth_key";
    ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'push_subscriptions' AND column_name = 'auth_key') THEN
        ALTER TABLE public.push_subscriptions ADD COLUMN "auth_key" text not null default '';
    END IF;
END $$;
