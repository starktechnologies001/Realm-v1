-- Migration to add 'chat_theme' column to friendships table for shared chat themes
ALTER TABLE friendships 
ADD COLUMN IF NOT EXISTS chat_theme TEXT DEFAULT 'default';

-- Add comment
COMMENT ON COLUMN friendships.chat_theme IS 'Shared theme identifier for the chat room';
