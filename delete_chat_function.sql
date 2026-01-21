
-- Function to delete chat for a specific user (Soft Delete)
-- Appends the user_id to the deleted_for array of all messages in the conversation
CREATE OR REPLACE FUNCTION delete_chat_for_user(
    p_user_id UUID, 
    p_partner_id UUID
)
RETURNS VOID AS $$
BEGIN
    UPDATE messages
    SET deleted_for = 
        CASE 
            WHEN deleted_for IS NULL THEN ARRAY[p_user_id]
            WHEN NOT (deleted_for @> ARRAY[p_user_id]) THEN array_append(deleted_for, p_user_id)
            ELSE deleted_for
        END
    WHERE 
        (sender_id = p_user_id AND receiver_id = p_partner_id) OR
        (sender_id = p_partner_id AND receiver_id = p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
