-- It seems a 'stories' table might have already existed without the new columns.
-- This script explicitly adds the missing columns to fix the schema error.

-- 1. Add 'media_url' if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stories' AND column_name = 'media_url') THEN
        ALTER TABLE stories ADD COLUMN media_url TEXT;
    END IF;
END $$;

-- 2. Add 'caption' if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stories' AND column_name = 'caption') THEN
        ALTER TABLE stories ADD COLUMN caption TEXT;
    END IF;
END $$;

-- 3. Add 'expires_at' if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stories' AND column_name = 'expires_at') THEN
        ALTER TABLE stories ADD COLUMN expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours');
    END IF;
END $$;

-- 4. Reload the schema cache is handled automatically by Supabase, but sometimes explicit NOTIFY helps (optional)
NOTIFY pgrst, 'reload config';
