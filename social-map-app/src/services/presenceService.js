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

  // Start heartbeat to update last_active_at every 60 seconds
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
    await supabase
      .from('profiles')
      .update({ 
        last_active_at: new Date().toISOString(),
        is_online: true 
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
    const updates = { is_online: isOnline };
    if (isOnline) {
      updates.last_active_at = new Date().toISOString();
    }

    await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId);
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
      .select('is_online, last_active_at, show_online_status, last_seen_privacy')
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
      lastSeen: data.last_active_at,
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
