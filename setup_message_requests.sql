-- Create message_requests table
CREATE TABLE IF NOT EXISTS public.message_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    thought_text TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_message_requests_receiver ON public.message_requests(receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_message_requests_sender ON public.message_requests(sender_id);

-- Enable RLS
ALTER TABLE public.message_requests ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Users can insert their own requests" ON public.message_requests;
CREATE POLICY "Users can insert their own requests"
    ON public.message_requests FOR INSERT
    WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "Users can view requests they sent or received" ON public.message_requests;
CREATE POLICY "Users can view requests they sent or received"
    ON public.message_requests FOR SELECT
    USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS "Receivers can update request status" ON public.message_requests;
CREATE POLICY "Receivers can update request status"
    ON public.message_requests FOR UPDATE
    USING (auth.uid() = receiver_id)
    WITH CHECK (auth.uid() = receiver_id);

DROP POLICY IF EXISTS "Senders can delete their own pending requests" ON public.message_requests;
DROP POLICY IF EXISTS "Senders and receivers can delete requests" ON public.message_requests;
CREATE POLICY "Senders and receivers can delete requests"
    ON public.message_requests FOR DELETE
    USING ((auth.uid() = sender_id AND status = 'pending') OR auth.uid() = receiver_id);

-- RPC to accept a message request
CREATE OR REPLACE FUNCTION accept_message_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_request RECORD;
    v_user_id UUID;
    v_message_id UUID;
BEGIN
    v_user_id := auth.uid();

    -- Fetch request
    SELECT * INTO v_request 
    FROM message_requests 
    WHERE id = p_request_id AND receiver_id = v_user_id AND status = 'pending';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found or not pending');
    END IF;

    -- Update request status
    UPDATE message_requests 
    SET status = 'accepted', updated_at = NOW() 
    WHERE id = p_request_id;

    -- Insert into messages table
    -- Add context about the thought in the message
    INSERT INTO messages (
        sender_id,
        receiver_id,
        content,
        message_type,
        is_read,
        created_at
    ) VALUES (
        v_request.sender_id,
        v_user_id,
        'Replied to your thought "' || COALESCE(v_request.thought_text, '') || '": ' || v_request.content,
        'text',
        false,
        NOW()
    ) RETURNING id INTO v_message_id;

    -- Optional: If you also want them to become friends automatically upon accepting request
    -- you would insert into friendships here. For now, we just insert the message.

    RETURN jsonb_build_object('success', true, 'message_id', v_message_id);
END;
$$;

GRANT EXECUTE ON FUNCTION accept_message_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION accept_message_request(UUID) TO service_role;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
