-- RPC to update chat theme in the new shared_themes table
-- UPDATED: Removed the internal system message insertion to avoid duplicates.
-- The frontend now handles sending the formatted "System Message" (e.g., "Leaf Drift" instead of "leaf_drift").

CREATE OR REPLACE FUNCTION update_chat_theme(
    p_partner_id UUID,
    p_theme TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_1 UUID;
    v_user_2 UUID;
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();

    -- Determine order to ensure unique row (smaller ID first)
    IF v_user_id < p_partner_id THEN
        v_user_1 := v_user_id;
        v_user_2 := p_partner_id;
    ELSE
        v_user_1 := p_partner_id;
        v_user_2 := v_user_id;
    END IF;

    -- Upsert (Insert or Update)
    INSERT INTO shared_themes (user_1, user_2, theme, updated_at)
    VALUES (v_user_1, v_user_2, p_theme, NOW())
    ON CONFLICT (user_1, user_2)
    DO UPDATE SET 
        theme = EXCLUDED.theme,
        updated_at = NOW();

    -- REMOVED: System message insertion is now handled by the client
    -- to allow formatting (e.g. "Leaf Drift" instead of "leaf_drift")
    
    RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION update_chat_theme(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_chat_theme(UUID, TEXT) TO service_role;
