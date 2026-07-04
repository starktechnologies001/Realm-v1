-- SQL script to fix thought_reactions RLS policies
-- This allows the thought owner (the person who posted the thought) to delete reactions left on their thought.

-- 1. Drop existing users can manage reactions policy
DROP POLICY IF EXISTS "Users can manage their own reactions" ON public.thought_reactions;

-- 2. Re-create the policy for users to manage their own reactions (insert, update, delete)
CREATE POLICY "Users can manage their own reactions" 
ON public.thought_reactions FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 3. Create a new policy to allow thought owners (the person who posted the thought) to delete reactions left on their thought
DROP POLICY IF EXISTS "Thought owners can delete reactions" ON public.thought_reactions;
CREATE POLICY "Thought owners can delete reactions" 
ON public.thought_reactions FOR DELETE 
USING (auth.uid() = thought_id);

-- 4. Reload schema cache to make sure the policy is immediately active
NOTIFY pgrst, 'reload schema';
