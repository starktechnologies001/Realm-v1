-- RPC V3: Debug Ping
-- Simplest possible function to test connectivity and params
CREATE OR REPLACE FUNCTION get_chat_theme_v3(
    p_partner_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_theme TEXT;
    v_user_1 UUID;
    v_user_2 UUID;
BEGIN
    -- Determine order to ensure unique row (smaller ID first)
    IF auth.uid() < p_partner_id THEN
        v_user_1 := auth.uid();
        v_user_2 := p_partner_id;
    ELSE
        v_user_1 := p_partner_id;
        v_user_2 := auth.uid();
    END IF;

    -- Get theme from shared_themes
    SELECT theme INTO v_theme
    FROM shared_themes
    WHERE user_1 = v_user_1 AND user_2 = v_user_2
    LIMIT 1;

    -- If no theme found, return null or default
    IF v_theme IS NULL THEN
        v_theme := 'clean_slate'; -- Or 'none_found' if you prefer to handle default in UI. 
        -- Based on UI logic, returning null/clean_slate is fine.
    END IF;

    RETURN jsonb_build_object(
        'status', 'queried', 
        'theme', v_theme,
        'my_id', auth.uid(), 
        'partner_id', p_partner_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_chat_theme_v3(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_chat_theme_v3(UUID) TO service_role;
