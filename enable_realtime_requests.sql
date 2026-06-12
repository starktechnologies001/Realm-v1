-- Enable realtime for message_requests table safely
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'message_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE message_requests;
  END IF;
END
$$;

-- Set replica identity full so that UPDATE and DELETE events send the old row data
-- This is necessary to properly decrement the counter when a request is updated or deleted.
ALTER TABLE message_requests REPLICA IDENTITY FULL;
