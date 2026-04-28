-- 1. Create the pg_net extension if not enabled
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Create the push trigger function
CREATE OR REPLACE FUNCTION public.handle_new_message_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  -- ⚠️ YOU MUST REPLACE THESE TWO VARIABLES WITH YOUR ACTUAL SUPABASE CREDENTIALS ⚠️
  project_url text := '<YOUR_PROJECT_URL>'; 
  service_key text := '<YOUR_SERVICE_ROLE_KEY>';
BEGIN
  -- Call the Edge Function
  PERFORM net.http_post(
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
  RETURN NEW;
END;
$$;

-- 3. Drop the outdated trigger (if it exists)
DROP TRIGGER IF EXISTS on_new_call_push ON public.calls;

-- 4. Create the correct trigger for call_sessions
DROP TRIGGER IF EXISTS on_new_call_session_push ON public.call_sessions;
CREATE TRIGGER on_new_call_session_push
  AFTER INSERT ON public.call_sessions
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_message_push();
