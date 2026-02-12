-- Recreate push_subscriptions table to fix schema issues
DROP TABLE IF EXISTS public.push_subscriptions CASCADE;

-- Create table
create table public.push_subscriptions (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.profiles(id) on delete cascade not null,
    endpoint text not null unique,
    p256dh text not null,
    auth_key text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    last_used_at timestamp with time zone default timezone('utc'::text, now())
);

-- RLS
alter table public.push_subscriptions enable row level security;

create policy "Users can insert their own subscriptions"
    on public.push_subscriptions for insert
    with check (auth.uid() = user_id);

create policy "Users can delete their own subscriptions"
    on public.push_subscriptions for delete
    using (auth.uid() = user_id);

create policy "Users can view their own subscriptions"
    on public.push_subscriptions for select
    using (auth.uid() = user_id);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions(user_id);

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
