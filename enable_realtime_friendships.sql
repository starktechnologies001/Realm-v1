-- Enable realtime for friendships table so poke requests arrive instantly
ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;

-- Verify
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
AND tablename = 'friendships';
