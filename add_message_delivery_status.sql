-- Add delivery status columns to messages table
-- This enables tracking of message delivery states: sent, delivered, seen

-- Add new columns
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'sent',
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ;

-- Add constraint to ensure valid status values
ALTER TABLE messages 
DROP CONSTRAINT IF EXISTS delivery_status_check;

ALTER TABLE messages 
ADD CONSTRAINT delivery_status_check 
CHECK (delivery_status IN ('sent', 'delivered', 'seen'));

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_messages_delivery_status 
ON messages(delivery_status, receiver_id);

-- Migrate existing data
-- Set delivered for all existing messages (they were already delivered)
-- Set seen for messages that are already read
UPDATE messages 
SET delivery_status = CASE 
    WHEN is_read = true THEN 'seen'
    ELSE 'delivered'
END,
seen_at = CASE 
    WHEN is_read = true THEN created_at
    ELSE NULL
END,
delivered_at = created_at
WHERE delivery_status IS NULL OR delivery_status = 'sent';

-- Verify the changes
SELECT 
    delivery_status,
    COUNT(*) as count
FROM messages
GROUP BY delivery_status
ORDER BY delivery_status;
