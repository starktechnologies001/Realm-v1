-- Ensure mute_settings column exists
alter table public.profiles 
add column if not exists mute_settings jsonb default '{}'::jsonb;

-- Re-apply RLS/Grants just in case?
-- Usually not needed for new columns if table has grants, but good to be safe.
grant update on public.profiles to authenticated;
