-- Enable pg_net extension if not already enabled
create extension if not exists pg_net;

-- Create a trigger function that calls the Edge Function
create or replace function public.handle_new_message_push()
returns trigger
language plpgsql
security definer
as $$
declare
  project_url text := '<YOUR_PROJECT_URL>'; -- e.g. https://xyz.supabase.co
  service_key text := '<YOUR_SERVICE_ROLE_KEY>';
begin
  -- Call the Edge Function
  perform net.http_post(
    url := project_url || '/functions/v1/push-dispatcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', row_to_json(NEW)
    )
  );
  return new;
end;
$$;

-- Trigger for Messages
drop trigger if exists on_new_message_push on public.messages;
create trigger on_new_message_push
  after insert on public.messages
  for each row execute procedure public.handle_new_message_push();

-- Trigger for Calls
drop trigger if exists on_new_call_push on public.calls;
create trigger on_new_call_push
  after insert on public.calls
  for each row execute procedure public.handle_new_message_push();
