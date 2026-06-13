-- Ensure visibility_mode column exists in profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS visibility_mode text;

-- Set default value to 'public'
ALTER TABLE public.profiles ALTER COLUMN visibility_mode SET DEFAULT 'public';

-- Update existing null values to 'public'
UPDATE public.profiles SET visibility_mode = 'public' WHERE visibility_mode IS NULL;
