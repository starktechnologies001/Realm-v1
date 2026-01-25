-- Create blocks table for user blocking functionality
CREATE TABLE IF NOT EXISTS blocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    blocker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(blocker_id, blocked_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id);

-- Add comment
COMMENT ON TABLE blocks IS 'Stores user blocking relationships';

-- Enable Row Level Security
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for re-running the script)
DROP POLICY IF EXISTS "Users can view their blocks" ON blocks;
DROP POLICY IF EXISTS "Users can block others" ON blocks;
DROP POLICY IF EXISTS "Users can unblock" ON blocks;

-- RLS Policy: Users can view their own blocks AND blocks where they are the target
CREATE POLICY "Users can view their blocks" ON blocks
    FOR SELECT USING (auth.uid() = blocker_id OR auth.uid() = blocked_id);

-- RLS Policy: Users can create blocks
CREATE POLICY "Users can block others" ON blocks
    FOR INSERT WITH CHECK (auth.uid() = blocker_id);

-- RLS Policy: Users can delete their blocks (unblock)
CREATE POLICY "Users can unblock" ON blocks
    FOR DELETE USING (auth.uid() = blocker_id);
