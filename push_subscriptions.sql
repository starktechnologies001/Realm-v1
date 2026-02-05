-- Create table for storing Web Push Subscriptions
create table if not exists public.push_subscriptions (
    id uuid not null default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    subscription jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    
    constraint push_subscriptions_pkey primary key (id),
    constraint push_subscriptions_user_id_subscription_key unique (user_id, subscription)
);

-- RLS Policies
alter table public.push_subscriptions enable row level security;

create policy "Users can insert their own subscriptions"
    on public.push_subscriptions for insert
    with check (auth.uid() = user_id);

create policy "Users can select their own subscriptions"
    on public.push_subscriptions for select
    using (auth.uid() = user_id);

create policy "Users can delete their own subscriptions"
    on public.push_subscriptions for delete
    using (auth.uid() = user_id);

-- Grants
grant all on public.push_subscriptions to postgres;
grant all on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;
