-- add_streak_columns.sql

-- Add streak tracking columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS current_streak INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS best_streak INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_active_date DATE;

-- Update existing users to have 0 streak (handled by default but good to make sure)
UPDATE public.profiles 
SET current_streak = 0, best_streak = 0 
WHERE current_streak IS NULL;
