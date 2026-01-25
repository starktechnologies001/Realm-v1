import { supabase } from '../supabaseClient';

/**
 * Block a user
 * @param {string} blockerId - ID of the user doing the blocking
 * @param {string} blockedId - ID of the user being blocked
 * @returns {Promise<{success: boolean, error?: any}>}
 */
export const blockUser = async (blockerId, blockedId) => {
    try {
        const { error } = await supabase
            .from('blocks')
            .insert({
                blocker_id: blockerId,
                blocked_id: blockedId
            });

        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('Block user error:', error);
        return { success: false, error };
    }
};

/**
 * Unblock a user
 * @param {string} blockerId - ID of the user doing the unblocking
 * @param {string} blockedId - ID of the user being unblocked
 * @returns {Promise<{success: boolean, error?: any}>}
 */
export const unblockUser = async (blockerId, blockedId) => {
    try {
        const { error } = await supabase
            .from('blocks')
            .delete()
            .eq('blocker_id', blockerId)
            .eq('blocked_id', blockedId);

        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('Unblock user error:', error);
        return { success: false, error };
    }
};

/**
 * Check if user A has blocked user B
 * @param {string} userId - ID of the user who might have blocked
 * @param {string} targetId - ID of the potentially blocked user
 * @returns {Promise<boolean>}
 */
export const isUserBlocked = async (userId, targetId) => {
    try {
        const { data, error } = await supabase
            .from('blocks')
            .select('id')
            .eq('blocker_id', userId)
            .eq('blocked_id', targetId)
            .maybeSingle();

        return !!data && !error;
    } catch (error) {
        return false;
    }
};

/**
 * Check if there's a mutual block (either user blocked the other)
 * @param {string} user1Id - First user ID
 * @param {string} user2Id - Second user ID
 * @returns {Promise<boolean>}
 */
export const isBlockedMutual = async (user1Id, user2Id) => {
    try {
        const { data, error} = await supabase
            .from('blocks')
            .select('id')
            .or(`and(blocker_id.eq.${user1Id},blocked_id.eq.${user2Id}),and(blocker_id.eq.${user2Id},blocked_id.eq.${user1Id})`)
            .maybeSingle();

        return !error && !!data;
    } catch (error) {
        return false;
    }
};

/**
 * Get list of blocked user IDs for a user
 * @param {string} userId - ID of the user
 * @returns {Promise<string[]>}
 */
export const getBlockedUserIds = async (userId) => {
    try {
        const { data, error } = await supabase
            .from('blocks')
            .select('blocked_id')
            .eq('blocker_id', userId);

        if (error) throw error;
        return data?.map(b => b.blocked_id) || [];
    } catch (error) {
        console.error('Get blocked users error:', error);
        return [];
    }
};

/**
 * Get list of user IDs who have blocked this user
 * @param {string} userId - ID of the user
 * @returns {Promise<string[]>}
 */
export const getBlockerIds = async (userId) => {
    try {
        const { data, error } = await supabase
            .from('blocks')
            .select('blocker_id')
            .eq('blocked_id', userId);

        if (error) throw error;
        return data?.map(b => b.blocker_id) || [];
    } catch (error) {
        console.error('Get blockers error:', error);
        return [];
    }
};
