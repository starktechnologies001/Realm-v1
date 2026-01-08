/**
 * Format last seen timestamp into human-readable text
 */
export const formatLastSeen = (lastActiveAt) => {
  if (!lastActiveAt) return 'Last seen recently';
  
  const now = new Date();
  const lastActive = new Date(lastActiveAt);
  const diffMs = now - lastActive;
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Last seen just now';
  if (diffMins < 60) return `Last seen ${diffMins} min ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `Last seen ${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `Last seen ${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 4) return `Last seen ${diffWeeks} week${diffWeeks > 1 ? 's' : ''} ago`;
  
  return 'Last seen a while ago';
};

/**
 * Check if viewer can see target user's presence based on privacy settings
 */
export const canViewPresence = (targetUser, viewerId, isFriend = false) => {
  if (!targetUser) return { online: false, lastSeen: false };
  
  // If user has hidden online status completely
  if (!targetUser.show_online_status) {
    return { online: false, lastSeen: false };
  }
  
  const privacy = targetUser.last_seen_privacy || 'everyone';
  
  // Nobody can see last seen
  if (privacy === 'nobody') {
    return { online: true, lastSeen: false };
  }
  
  // Only friends can see last seen
  if (privacy === 'friends' && !isFriend) {
    return { online: true, lastSeen: false };
  }
  
  // Everyone can see
  return { online: true, lastSeen: true };
};

/**
 * Get display status text based on presence and privacy
 */
export const getDisplayStatus = (presence, canView) => {
  if (!canView.online) {
    return '';
  }
  
  if (presence.isOnline) {
    return 'Online';
  }
  
  if (!canView.lastSeen) {
    return 'Last seen recently';
  }
  
  return formatLastSeen(presence.lastSeen);
};
