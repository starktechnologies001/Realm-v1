-- RPC V2 to fetch chat theme from shared_themes table
CREATE OR REPLACE FUNCTION get_chat_theme_v2(
    p_partner_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_theme TEXT;
    v_user_id UUID;
    v_user_1 UUID;
    v_user_2 UUID;
BEGIN
    v_user_id := auth.uid();

    -- Determine order
    IF v_user_id < p_partner_id THEN
        v_user_1 := v_user_id;
        v_user_2 := p_partner_id;
    ELSE
        v_user_1 := p_partner_id;
        v_user_2 := v_user_id;
    END IF;

    -- Get theme
    SELECT theme INTO v_theme
    FROM shared_themes
    WHERE user_1 = v_user_1 AND user_2 = v_user_2
    LIMIT 1;

    RETURN jsonb_build_object(
        'theme', v_theme,
        'status', 'found_in_shared_themes',
        'debug_id_1', v_user_1,
        'debug_id_2', v_user_2
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_chat_theme_v2(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_chat_theme_v2(UUID) TO service_role;
