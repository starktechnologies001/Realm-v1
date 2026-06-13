-- Run this in Supabase SQL Editor to clear rejected/declined message requests
-- so users can attempt to send new replies after being declined.
-- This is safe — it only deletes rows where status = 'rejected'.
-- Once users become friends, they won't need message requests anyway.

DELETE FROM public.message_requests
WHERE status = 'rejected';

-- Verify
SELECT id, sender_id, receiver_id, status, created_at
FROM public.message_requests
ORDER BY created_at DESC
LIMIT 20;
