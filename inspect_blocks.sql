
-- Inspect blocks with names to verify direction
SELECT 
    b.id,
    b.created_at,
    blocker.username as blocker_name,
    blocker.id as blocker_id,
    blocked.username as blocked_name,
    blocked.id as blocked_id
FROM blocks b
JOIN profiles blocker ON b.blocker_id = blocker.id
JOIN profiles blocked ON b.blocked_id = blocked.id;
