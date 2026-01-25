-- Ensure calls table has necessary columns for duration tracking
ALTER TABLE public.calls 
ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS duration_seconds INTEGER DEFAULT 0;

-- Comment for clarity
COMMENT ON COLUMN public.calls.duration_seconds IS 'Duration of the call in seconds';
