-- 1. Create the thought_reactions table
CREATE TABLE IF NOT EXISTS public.thought_reactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    thought_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    reaction_type VARCHAR NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(thought_id, user_id) -- One reaction per user per thought
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.thought_reactions DISABLE ROW LEVEL SECURITY; -- Reset first
ALTER TABLE public.thought_reactions ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies
-- Authenticated users can view all thought reactions
DROP POLICY IF EXISTS "Anyone can view thought reactions" ON public.thought_reactions;
CREATE POLICY "Anyone can view thought reactions" 
ON public.thought_reactions FOR SELECT 
USING (auth.role() = 'authenticated');

-- Authenticated users can manage (insert/update/delete) their own reactions
DROP POLICY IF EXISTS "Users can manage their own reactions" ON public.thought_reactions;
CREATE POLICY "Users can manage their own reactions" 
ON public.thought_reactions FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 4. Enable Realtime Replication
ALTER PUBLICATION supabase_realtime ADD TABLE public.thought_reactions;

-- 5. Create performance indexes
CREATE INDEX IF NOT EXISTS idx_thought_reactions_thought ON public.thought_reactions(thought_id);
CREATE INDEX IF NOT EXISTS idx_thought_reactions_user ON public.thought_reactions(user_id);

-- 6. Reload schema cache
NOTIFY pgrst, 'reload schema';
