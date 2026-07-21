import { supabase } from '../supabaseClient';

let heartbeatInterval = null;
let activityTimeout = null;

/**
 * Initialize presence tracking for the current user
 */
export const initializePresence = async (userId) => {
  if (!userId) return;

  // Set user as online
  await setOnline(userId, true);

  // Start heartbeat to update last_active every 60 seconds
  heartbeatInterval = setInterval(() => {
    updateActivity(userId);
  }, 60000);

  // Track user activity
  setupActivityListeners(userId);

  // Handle page unload
  window.addEventListener('beforeunload', () => {
    cleanupPresence(userId);
  });

  // Handle visibility changes
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      setOnline(userId, false);
    } else {
      setOnline(userId, true);
      updateActivity(userId);
    }
  });
};

/**
 * Update user's last activity timestamp
 */
export const updateActivity = async (userId) => {
  if (!userId) return;

  try {
    const now = new Date().toISOString();
    await supabase
      .from('profiles')
      .update({ 
        last_active: now,
        last_seen: now,
        is_online: true,
        activity_status: 'live'
      })
      .eq('id', userId);
  } catch (error) {
    console.error('Error updating activity:', error);
  }
};

/**
 * Set user's online status
 */
export const setOnline = async (userId, isOnline) => {
  if (!userId) return;

  try {
    const now = new Date().toISOString();
    const updates = { 
      is_online: isOnline,
      activity_status: isOnline ? 'live' : 'offline',
      last_active: now,
      last_seen: now
    };

    await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId);

    // Guaranteed beacon/fetch for fast offline update on app exit or unload
    if (!isOnline && typeof fetch === 'function') {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        if (supabaseUrl && supabaseAnonKey) {
          fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, {
            method: 'PATCH',
            keepalive: true,
            headers: {
              'apikey': supabaseAnonKey,
              'Authorization': `Bearer ${supabaseAnonKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
              is_online: false,
              activity_status: 'offline',
              last_seen: now,
              last_active: now
            })
          }).catch(() => {});
        }
      } catch (e) {}
    }
  } catch (error) {
    console.error('Error setting online status:', error);
  }
};

/**
 * Setup activity listeners with throttling
 */
const setupActivityListeners = (userId) => {
  let lastUpdate = Date.now();
  const THROTTLE_MS = 30000; // 30 seconds

  const throttledUpdate = () => {
    const now = Date.now();
    if (now - lastUpdate > THROTTLE_MS) {
      updateActivity(userId);
      lastUpdate = now;
    }
  };

  // Mouse movement
  document.addEventListener('mousemove', throttledUpdate);
  
  // Keyboard input
  document.addEventListener('keydown', throttledUpdate);
  
  // Scroll events
  document.addEventListener('scroll', throttledUpdate);
};

/**
 * Cleanup presence tracking
 */
export const cleanupPresence = async (userId) => {
  if (!userId) return;

  // Clear intervals
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  if (activityTimeout) {
    clearTimeout(activityTimeout);
    activityTimeout = null;
  }

  // Set user offline
  await setOnline(userId, false);
};

/**
 * Get presence status for a user (respecting privacy settings)
 */
export const getPresenceStatus = async (targetUserId, viewerId) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('is_online, last_active, show_online_status, last_seen_privacy')
      .eq('id', targetUserId)
      .maybeSingle();

    if (error) throw error;

    // Check privacy settings
    if (!data.show_online_status) {
      return {
        isOnline: false,
        lastSeen: null,
        canViewOnline: false,
        canViewLastSeen: false
      };
    }

    // Check last seen privacy
    let canViewLastSeen = true;
    if (data.last_seen_privacy === 'nobody') {
      canViewLastSeen = false;
    } else if (data.last_seen_privacy === 'friends') {
      // Check if viewer is a friend
      const { data: friendship } = await supabase
        .from('friends')
        .select('id')
        .or(`and(user_id.eq.${viewerId},friend_id.eq.${targetUserId}),and(user_id.eq.${targetUserId},friend_id.eq.${viewerId})`)
        .eq('status', 'accepted')
        .maybeSingle();

      canViewLastSeen = !!friendship;
    }

    return {
      isOnline: data.is_online,
      lastSeen: data.last_active,
      canViewOnline: true,
      canViewLastSeen
    };
  } catch (error) {
    console.error('Error getting presence status:', error);
    return {
      isOnline: false,
      lastSeen: null,
      canViewOnline: false,
      canViewLastSeen: false
    };
  }
};
