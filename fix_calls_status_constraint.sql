-- Fix calls table status constraint to allow 'cancelled'
-- Current constraint is rejecting 'cancelled' status

-- Drop the existing constraint
ALTER TABLE calls DROP CONSTRAINT IF EXISTS calls_status_check;

-- Recreate with 'cancelled' included
ALTER TABLE calls ADD CONSTRAINT calls_status_check 
CHECK (status IN ('pending', 'ringing', 'active', 'accepted', 'ended', 'declined', 'rejected', 'missed', 'busy', 'cancelled'));

-- Verify the constraint
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'calls'::regclass AND conname = 'calls_status_check';
