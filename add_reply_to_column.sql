-- Add reply_to_message_id column to messages table
-- This enables the reply-to-message feature

-- Add the column (nullable, references messages.id)
ALTER TABLE messages 
ADD COLUMN reply_to_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;

-- Add index for better query performance
CREATE INDEX idx_messages_reply_to ON messages(reply_to_message_id);

-- Add comment for documentation
COMMENT ON COLUMN messages.reply_to_message_id IS 'References the original message that this message is replying to';
