-- Delete duplicate call log messages
-- This script finds and removes duplicate call logs created during race conditions
-- It keeps the most recent call log for each unique combination of sender, receiver, and timestamp

-- First, let's identify duplicates (for review)
-- Uncomment to see what will be deleted:
/*
SELECT 
    id,
    sender_id,
    receiver_id,
    content,
    created_at,
    ROW_NUMBER() OVER (
        PARTITION BY sender_id, receiver_id, DATE_TRUNC('second', created_at)
        ORDER BY created_at DESC
    ) as row_num
FROM messages
WHERE message_type = 'call_log'
    AND ROW_NUMBER() OVER (
        PARTITION BY sender_id, receiver_id, DATE_TRUNC('second', created_at)
        ORDER BY created_at DESC
    ) > 1;
*/

-- Delete duplicates, keeping only the most recent one for each call
WITH duplicates AS (
    SELECT 
        id,
        ROW_NUMBER() OVER (
            PARTITION BY sender_id, receiver_id, DATE_TRUNC('second', created_at)
            ORDER BY created_at DESC
        ) as row_num
    FROM messages
    WHERE message_type = 'call_log'
)
DELETE FROM messages
WHERE id IN (
    SELECT id 
    FROM duplicates 
    WHERE row_num > 1
);

-- Show how many call logs remain
SELECT COUNT(*) as remaining_call_logs
FROM messages
WHERE message_type = 'call_log';
