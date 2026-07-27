import { supabase } from '../supabaseClient';

/**
 * Live Location Service
 * Encapsulates all backend interaction for Live Location Sharing.
 */

// Request a new live location share
export async function requestLiveLocation(recipientId, durationMinutes) {
    const { data, error } = await supabase.rpc('request_live_location_share', {
        p_recipient_id: recipientId,
        p_duration_minutes: durationMinutes
    });
    if (error) throw error;
    return data; // returns share_id (uuid)
}

// Accept a live location share request
export async function acceptLiveLocation(shareId) {
    const { error } = await supabase.rpc('accept_live_location_share', {
        p_share_id: shareId
    });
    if (error) throw error;
}

// Decline a live location share request
export async function declineLiveLocation(shareId) {
    const { error } = await supabase.rpc('decline_live_location_share', {
        p_share_id: shareId
    });
    if (error) throw error;
}

// Revoke an active live location share
export async function revokeLiveLocation(shareId) {
    const { error } = await supabase.rpc('revoke_live_location_share', {
        p_share_id: shareId
    });
    if (error) throw error;
}

// Fetch active live location share between two users if it exists
export async function getActiveShareBetweenUsers(userA, userB) {
    if (!userA || !userB) return null;
    const { data, error } = await supabase
        .from('live_location_shares')
        .select('*')
        .or(`and(requester_id.eq.${userA},recipient_id.eq.${userB}),and(requester_id.eq.${userB},recipient_id.eq.${userA})`)
        .eq('status', 'accepted')
        .gt('expires_at', new Date().toISOString())
        .is('revoked_at', null)
        .maybeSingle();

    if (error && error.code !== 'PGRST116') {
        console.error('Error fetching active live location share:', error);
    }
    return data || null;
}

// Fetch share by ID
export async function getShareById(shareId) {
    if (!shareId) return null;
    const { data, error } = await supabase
        .from('live_location_shares')
        .select('*')
        .eq('id', shareId)
        .maybeSingle();

    if (error) {
        console.error('Error fetching share by ID:', error);
    }
    return data || null;
}

// Fetch all active shares for a given user (either requester or recipient)
export async function getActiveSharesForUser(userId) {
    if (!userId) return [];
    const { data, error } = await supabase
        .from('live_location_shares')
        .select('*')
        .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`)
        .eq('status', 'accepted')
        .gt('expires_at', new Date().toISOString())
        .is('revoked_at', null);

    if (error) {
        console.error('Error fetching active shares for user:', error);
        return [];
    }
    return data || [];
}

// Publish caller's exact GPS location
export async function publishExactLocation(userId, latitude, longitude, accuracy = null) {
    if (!userId || latitude == null || longitude == null) return;
    const now = new Date().toISOString();
    const { error } = await supabase
        .from('live_locations')
        .upsert({
            user_id: userId,
            latitude,
            longitude,
            accuracy,
            updated_at: now
        }, { onConflict: 'user_id' });

    if (error) {
        // If RLS rejects because no active share exists, silently log (expected invariant protection)
        if (error.code === '42501' || error.message?.includes('violates row-level security policy')) {
            // RLS prevented unnecessary exact-coordinate storage
            return;
        }
        console.error('Error publishing exact location:', error);
    }
}

// Delete caller's exact GPS location row
export async function deleteExactLocation(userId) {
    if (!userId) return;
    const { error } = await supabase
        .from('live_locations')
        .delete()
        .eq('user_id', userId);

    if (error && error.code !== 'PGRST116') {
        console.error('Error deleting exact location:', error);
    }
}

// Fetch partner's exact GPS location
export async function getPartnerExactLocation(partnerId) {
    if (!partnerId) return null;
    const { data, error } = await supabase
        .from('live_locations')
        .select('*')
        .eq('user_id', partnerId)
        .maybeSingle();

    if (error) {
        return null;
    }
    return data || null;
}

// Subscribe to partner's exact GPS changes via Realtime
export function subscribeToPartnerLocation(partnerId, onUpdate) {
    if (!partnerId) return () => {};

    const channelName = `live_location_${partnerId}_${Date.now()}`;
    const channel = supabase.channel(channelName)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'live_locations',
                filter: `user_id=eq.${partnerId}`
            },
            (payload) => {
                if (payload.eventType === 'DELETE') {
                    onUpdate(null);
                } else if (payload.new) {
                    onUpdate(payload.new);
                }
            }
        )
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
}

// Subscribe to share status updates (e.g. accept, decline, revoke, expire)
export function subscribeToShareUpdates(shareId, onUpdate) {
    if (!shareId) return () => {};

    const channelName = `live_share_${shareId}_${Date.now()}`;
    const channel = supabase.channel(channelName)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'live_location_shares',
                filter: `id=eq.${shareId}`
            },
            (payload) => {
                if (payload.new) {
                    onUpdate(payload.new);
                }
            }
        )
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
}
