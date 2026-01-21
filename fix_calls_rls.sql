-- Enable RLS
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Calls are visible to participants" ON calls;
DROP POLICY IF EXISTS "Participants can insert calls" ON calls;
DROP POLICY IF EXISTS "Participants can update calls" ON calls;

-- Create comprehensive policies

-- 1. View Policy: Users can see calls where they are the caller OR receiver
CREATE POLICY "Calls are visible to participants" 
ON calls FOR SELECT 
USING (
    auth.uid() = caller_id OR 
    auth.uid() = receiver_id
);

-- 2. Insert Policy: Users can create calls (will be 'caller_id' usually)
CREATE POLICY "Participants can insert calls" 
ON calls FOR INSERT 
WITH CHECK (
    auth.uid() = caller_id
);

-- 3. Update Policy: Users can update status if they are involved
CREATE POLICY "Participants can update calls" 
ON calls FOR UPDATE 
USING (
    auth.uid() = caller_id OR 
    auth.uid() = receiver_id
);

-- Grant access to authenticated users
GRANT ALL ON calls TO authenticated;
