-- 1. Add reactions column to messages table if it doesn't exist
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}'::jsonb;

-- 2. Create the RPC function to safely toggle a reaction
CREATE OR REPLACE FUNCTION toggle_message_reaction(p_message_id UUID, p_emoji TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_message RECORD;
    v_reactions JSONB;
    v_current_emoji TEXT;
BEGIN
    v_user_id := auth.uid();
    
    -- Check if user is logged in
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    -- Fetch the message and ensure the user is either the sender or receiver
    SELECT * INTO v_message FROM public.messages WHERE id = p_message_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Message not found');
    END IF;

    IF v_message.sender_id != v_user_id AND v_message.receiver_id != v_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authorized to react to this message');
    END IF;

    -- Get current reactions
    v_reactions := COALESCE(v_message.reactions, '{}'::jsonb);
    
    -- Check current user's reaction
    v_current_emoji := v_reactions ->> v_user_id::TEXT;

    -- Toggle logic: If the same emoji is clicked, remove it. Otherwise, set it.
    IF v_current_emoji = p_emoji THEN
        v_reactions := v_reactions - v_user_id::TEXT;
    ELSE
        v_reactions := jsonb_set(v_reactions, ARRAY[v_user_id::TEXT], to_jsonb(p_emoji));
    END IF;

    -- Update the message
    UPDATE public.messages SET reactions = v_reactions WHERE id = p_message_id;

    RETURN jsonb_build_object('success', true, 'reactions', v_reactions);
END;
$$;

-- Grant execution permission to authenticated users
GRANT EXECUTE ON FUNCTION toggle_message_reaction(UUID, TEXT) TO authenticated;

-- Notify PostgREST to reload the schema cache so the new column is visible to the API
NOTIFY pgrst, 'reload schema';
