-- Drop existing policies to ensure a clean slate
drop policy if exists "Users can insert their own subscriptions" on public.push_subscriptions;
drop policy if exists "Users can update their own subscriptions" on public.push_subscriptions;
drop policy if exists "Users can delete their own subscriptions" on public.push_subscriptions;
drop policy if exists "Users can view their own subscriptions" on public.push_subscriptions;

-- Re-create policies with correct permissions for UPSERT

-- 1. INSERT: Allow users to insert if the user_id matches their own ID
create policy "Users can insert their own subscriptions"
    on public.push_subscriptions for insert
    with check (auth.uid() = user_id);

-- 2. UPDATE: Allow users to update rows where user_id matches their own ID
-- This is critical for UPSERT operations (INSERT ... ON CONFLICT UPDATE)
create policy "Users can update their own subscriptions"
    on public.push_subscriptions for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- 3. DELETE: Allow users to delete their own subscriptions
create policy "Users can delete their own subscriptions"
    on public.push_subscriptions for delete
    using (auth.uid() = user_id);

-- 4. SELECT: Allow users to view their own subscriptions
create policy "Users can view their own subscriptions"
    on public.push_subscriptions for select
    using (auth.uid() = user_id);
