-- Add reply_to_story_id to messages table to support reacting to stories
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS reply_to_story_id UUID REFERENCES stories(id) ON DELETE SET NULL;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_messages_reply_story ON messages(reply_to_story_id);
