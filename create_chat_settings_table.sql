-- Create chat_settings table for storing per-pair settings like mute
create table if not exists public.chat_settings (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.profiles(id) not null,
    partner_id uuid references public.profiles(id) not null,
    muted_until timestamptz,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    
    -- Ensure one setting row per pair per user
    unique(user_id, partner_id)
);

-- Enable RLS
alter table public.chat_settings enable row level security;

-- Policies
create policy "Users can view their own settings"
    on public.chat_settings for select
    using (auth.uid() = user_id);

create policy "Users can insert/update their own settings"
    on public.chat_settings for all
    using (auth.uid() = user_id);
