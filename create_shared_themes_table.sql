-- Create a dedicated table for shared themes (decoupled from friendships)
CREATE TABLE IF NOT EXISTS public.shared_themes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_1 UUID NOT NULL REFERENCES public.profiles(id),
    user_2 UUID NOT NULL REFERENCES public.profiles(id),
    theme TEXT DEFAULT 'default',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure unique pair (order agnostic check via application logic or unique index)
    -- We will enforce user_1 < user_2 convention in the RPCs to ensure uniqueness
    CONSTRAINT unique_theme_pair UNIQUE (user_1, user_2)
);

-- RLS
ALTER TABLE public.shared_themes ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view settings they are part of"
    ON public.shared_themes FOR SELECT
    USING (auth.uid() = user_1 OR auth.uid() = user_2);

CREATE POLICY "Users can update settings they are part of"
    ON public.shared_themes FOR UPDATE
    USING (auth.uid() = user_1 OR auth.uid() = user_2);

CREATE POLICY "Users can insert settings they are part of"
    ON public.shared_themes FOR INSERT
    WITH CHECK (auth.uid() = user_1 OR auth.uid() = user_2);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE shared_themes;

-- Grant
GRANT ALL ON public.shared_themes TO authenticated;
GRANT ALL ON public.shared_themes TO service_role;
