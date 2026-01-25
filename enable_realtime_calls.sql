-- Add 'calls' table to the supabase_realtime publication
BEGIN;
  -- Check if publication exists (standard Supabase setup), if so, add table
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 
      FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND tablename = 'calls'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE calls;
    END IF;
  END
  $$;
COMMIT;

-- Verify
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'calls';
