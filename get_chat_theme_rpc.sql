-- RPC to fetch chat theme reliably with debugging
-- Bypasses complex RLS for finding the friendship

-- DROP existing function to allow return type change (TEXT -> JSONB)
DROP FUNCTION IF EXISTS get_chat_theme(UUID);

CREATE OR REPLACE FUNCTION get_chat_theme(
    p_partner_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with privileges of the function creator (admin/service_role)
AS $$
DECLARE
    v_theme TEXT;
    v_user_id UUID;
    v_count INT;
    v_friendship_id UUID;
BEGIN
    v_user_id := auth.uid();

    -- Check for duplicates/count
    SELECT count(*), min(id), min(chat_theme) 
    INTO v_count, v_friendship_id, v_theme
    FROM friendships
    WHERE 
        (requester_id = v_user_id AND receiver_id = p_partner_id)
        OR 
        (requester_id = p_partner_id AND receiver_id = v_user_id);

    RETURN jsonb_build_object(
        'theme', v_theme,
        'count', v_count,
        'friendship_id', v_friendship_id,
        'debug_uid', v_user_id,
        'debug_partner_in', p_partner_id
    );
END;
$$;

-- IMPORTANT: Grant permission to use this function
GRANT EXECUTE ON FUNCTION get_chat_theme(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_chat_theme(UUID) TO service_role;
